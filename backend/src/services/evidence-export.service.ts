import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../env";
import {
  createGithubInstallationToken,
  readGithubAppPrivateKey,
} from "../lib/github-app";
import { fetchGithubPullRequestMetadata } from "../lib/github-review";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "./repository-authorization.service";
import { recordAuditLog } from "./repository-authorization.service";

const exportInputSchema = z.object({
  pullRequestNumber: z.number().int().positive(),
  thesisRelevance: z.string().max(2_000).default(""),
}).strict();

const rateLimit = new Map<string, { count: number; resetAt: number }>();

function consumeRateLimit(userId: string) {
  const now = Date.now();
  const current = rateLimit.get(userId);
  if (!current || current.resetAt <= now) {
    rateLimit.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

function sanitizeScalar(value: unknown) {
  return String(value ?? "")
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[\[.*?\]\]/g, "[removed embed]")
    .replace(/\{\{.*?\}\}/g, "[removed template]")
    .slice(0, 20_000);
}

function yamlString(value: unknown) {
  return JSON.stringify(sanitizeScalar(value).replace(/^---$/gm, "- - -"));
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return cleaned || "Untitled PR";
}

function markdownHash(markdown: string) {
  return crypto.createHash("sha256").update(markdown).digest("hex");
}

function renderMarkdown(params: {
  repositoryFullName: string;
  pullRequestNumber: number;
  title: string;
  description: string;
  author: string;
  state: string;
  sourceUrl: string;
  headSha: string;
  mergeCommitSha?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  mergedAt?: string | null;
  exportedAt: string;
  reviewSummary: string;
  thesisRelevance: string;
}) {
  return `---\n` +
    `schema: "diffguard-pr-evidence/v1"\n` +
    `repository: ${yamlString(params.repositoryFullName)}\n` +
    `pull_request: ${params.pullRequestNumber}\n` +
    `title: ${yamlString(params.title)}\n` +
    `source_url: ${yamlString(params.sourceUrl)}\n` +
    `exported_at: ${yamlString(params.exportedAt)}\n` +
    `---\n\n` +
    `# PR-${String(params.pullRequestNumber).padStart(4, "0")} ${sanitizeScalar(params.title)}\n\n` +
    `Source: ${sanitizeScalar(params.sourceUrl)}\n\n` +
    `## Metadata\n\n` +
    `| Field | Value |\n` +
    `| --- | --- |\n` +
    `| Repository | ${sanitizeScalar(params.repositoryFullName)} |\n` +
    `| PR | #${params.pullRequestNumber} |\n` +
    `| Author | ${sanitizeScalar(params.author)} |\n` +
    `| Status | ${sanitizeScalar(params.state)} |\n` +
    `| Created | ${sanitizeScalar(params.createdAt)} |\n` +
    `| Updated | ${sanitizeScalar(params.updatedAt)} |\n` +
    `| Closed | ${sanitizeScalar(params.closedAt ?? "not closed")} |\n` +
    `| Merged | ${sanitizeScalar(params.mergedAt ?? "not merged")} |\n` +
    `| Head commit | ${sanitizeScalar(params.headSha)} |\n` +
    `| Merge commit | ${sanitizeScalar(params.mergeCommitSha ?? "not available")} |\n\n` +
    `## Description Snapshot\n\n${sanitizeScalar(params.description) || "_No description._"}\n\n` +
    `## DiffGuard Review Summary\n\n\`\`\`text\n${sanitizeScalar(params.reviewSummary) || "No DiffGuard review summary was available."}\n\`\`\`\n\n` +
    `## Thesis Relevance\n\n${sanitizeScalar(params.thesisRelevance) || "_Not specified._"}\n\n` +
    `## Snapshot Note\n\nThis note is a sanitized snapshot exported by DiffGuard. GitHub remains the source of truth for the pull request.\n`;
}

export const evidenceExportService = {
  parseInput(input: unknown) {
    const parsed = exportInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Evidence export input is invalid");
    return parsed.data;
  },

  async build(repositoryId: string, input: unknown, user: AuthenticatedUser) {
    if (!consumeRateLimit(user.id)) {
      throw new Error("Evidence export rate limit exceeded");
    }
    const data = this.parseInput(input);
    const repository = await prisma.githubRepository.findUnique({
      where: { id: repositoryId },
      include: { installation: true },
    });
    if (!repository) return null;
    if (!env.GITHUB_APP_ID) throw new Error("GitHub App ID is not configured");
    const privateKey = readGithubAppPrivateKey({
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      privateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH,
    });
    const token = await createGithubInstallationToken({
      installationId: repository.installation.githubInstallationId,
      appId: env.GITHUB_APP_ID,
      privateKey,
    });
    const pr = await fetchGithubPullRequestMetadata({
      repository: repository.fullName,
      pullRequestNumber: data.pullRequestNumber,
      token: token.token,
    });
    const latestRun = await prisma.reviewRun.findFirst({
      where: {
        repositoryId,
        pullRequestNumber: data.pullRequestNumber,
        headSha: pr.head.sha,
      },
      orderBy: { createdAt: "desc" },
      select: { reviewSummary: true, state: true, findingCount: true, skippedFileCount: true },
    });
    const reviewSummary = latestRun?.reviewSummary ??
      `State: ${latestRun?.state ?? "not reviewed"}\nFindings: ${latestRun?.findingCount ?? 0}\nSkipped files: ${latestRun?.skippedFileCount ?? 0}`;
    const filename = `PR-${String(pr.number).padStart(4, "0")} ${sanitizeFilename(pr.title)}.md`;
    const markdown = renderMarkdown({
      repositoryFullName: repository.fullName,
      pullRequestNumber: pr.number,
      title: pr.title,
      description: pr.body ?? "",
      author: pr.user?.login ?? "unknown",
      state: pr.state,
      sourceUrl: pr.html_url,
      headSha: pr.head.sha,
      mergeCommitSha: pr.merge_commit_sha,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at,
      mergedAt: pr.merged_at,
      exportedAt: new Date().toISOString(),
      reviewSummary,
      thesisRelevance: data.thesisRelevance,
    }).slice(0, 120_000);
    return {
      repository,
      pullRequestNumber: pr.number,
      headSha: pr.head.sha,
      filename,
      markdown,
      sha256: markdownHash(markdown),
    };
  },

  async preview(repositoryId: string, input: unknown, user: AuthenticatedUser) {
    const built = await this.build(repositoryId, input, user);
    if (!built) return null;
    await recordAuditLog({
      user,
      repositoryId,
      action: "pr_evidence.previewed",
      metadata: { pullRequestNumber: built.pullRequestNumber },
    });
    return {
      filename: built.filename,
      markdown: built.markdown,
      sha256: built.sha256,
    };
  },

  async download(repositoryId: string, input: unknown, user: AuthenticatedUser) {
    const built = await this.build(repositoryId, input, user);
    if (!built) return null;
    const latest = await prisma.pullRequestEvidenceExport.findFirst({
      where: { repositoryId, pullRequestNumber: built.pullRequestNumber },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await prisma.pullRequestEvidenceExport.create({
      data: {
        repositoryId,
        requestedByUserId: user.id,
        pullRequestNumber: built.pullRequestNumber,
        headSha: built.headSha,
        filename: built.filename,
        markdown: built.markdown,
        markdownSha256: built.sha256,
        version,
      },
    });
    await recordAuditLog({
      user,
      repositoryId,
      action: "pr_evidence.downloaded",
      metadata: { pullRequestNumber: built.pullRequestNumber, version },
    });
    return { ...built, version };
  },
};
