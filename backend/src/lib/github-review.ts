import crypto from "node:crypto";
import { z } from "zod";
import {
  GithubAppError,
  githubRetryAfterMilliseconds,
  type GithubFetch,
} from "./github-app";

const githubFileSchema = z.object({
  filename: z.string().min(1).max(1024).refine((value) => !/[\0-\x1f]/.test(value)),
  status: z.string().min(1),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  patch: z.string().max(2_000_000).nullable().optional(),
});
const githubFilesSchema = z.array(githubFileSchema).max(100);
const githubCommentSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  body: z.string().max(100_000).nullable(),
});
const githubCommentsSchema = z.array(githubCommentSchema).max(100);

export type GithubPullRequestFile = z.infer<typeof githubFileSchema>;

async function readGithubJson(response: Response, message: string) {
  try {
    return await response.json();
  } catch {
    throw new GithubAppError(message);
  }
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "DiffGuard",
  };
}

function repositoryPath(repository: string) {
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => !part || !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new GithubAppError("GitHub repository name is invalid");
  }
  return parts.map(encodeURIComponent).join("/");
}

export async function fetchGithubPullRequestFiles(params: {
  repository: string;
  pullRequestNumber: number;
  token: string;
  fetchImpl?: GithubFetch;
  maxPages?: number;
}): Promise<{ files: GithubPullRequestFile[]; paginationComplete: boolean }> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const maxPages = params.maxPages ?? 30;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 30) {
    throw new GithubAppError("GitHub file page limit is invalid");
  }
  const files: GithubPullRequestFile[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repositoryPath(params.repository)}/pulls/${params.pullRequestNumber}/files?per_page=100&page=${page}`,
      { headers: githubHeaders(params.token), signal: AbortSignal.timeout(15_000) },
    );

    if (!response.ok) {
      throw new GithubAppError(
        `GitHub pull request files request failed (${response.status})`,
        response.status,
        response.status === 429 ||
        response.headers.has("retry-after") ||
        response.headers.get("x-ratelimit-remaining") === "0"
          ? "RATE_LIMIT"
          : undefined,
        githubRetryAfterMilliseconds(response),
      );
    }

    const parsed = githubFilesSchema.safeParse(
      await readGithubJson(response, "GitHub returned an invalid pull request files response"),
    );
    if (!parsed.success) {
      throw new GithubAppError("GitHub returned an invalid pull request files response");
    }
    files.push(...parsed.data);
    if (parsed.data.length < 100) {
      return { files, paginationComplete: true };
    }
  }

  return { files, paginationComplete: false };
}

export function assessGithubFileCoverage(params: {
  file: GithubPullRequestFile;
  parsedAdditionCount: number;
  parsedDeletionCount: number;
}): { analyzable: boolean; reason?: "deleted" | "missing_patch" | "truncated_patch" } {
  if (params.file.status === "removed") {
    return { analyzable: false, reason: "deleted" };
  }
  if (!params.file.patch) {
    return { analyzable: false, reason: "missing_patch" };
  }
  if (
    params.parsedAdditionCount < params.file.additions ||
    params.parsedDeletionCount < params.file.deletions
  ) {
    return { analyzable: false, reason: "truncated_patch" };
  }
  return { analyzable: true };
}

export function findingMarker(fingerprint: string, markerSecret: string) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error("Finding fingerprint must be a SHA-256 hex digest");
  }
  if (!markerSecret) {
    throw new Error("Finding marker secret is required");
  }
  const authenticationTag = crypto
    .createHmac("sha256", markerSecret)
    .update(`diffguard-finding:${fingerprint}`)
    .digest("hex");
  return `<!-- diffguard:${fingerprint}:${authenticationTag} -->`;
}

export async function findGithubReviewCommentByFingerprint(params: {
  repository: string;
  pullRequestNumber: number;
  token: string;
  fingerprint: string;
  markerSecret: string;
  fetchImpl?: GithubFetch;
}): Promise<number | undefined> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const marker = findingMarker(params.fingerprint, params.markerSecret);

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repositoryPath(params.repository)}/pulls/${params.pullRequestNumber}/comments?per_page=100&page=${page}`,
      { headers: githubHeaders(params.token), signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) {
      throw new GithubAppError(
        `GitHub review comments request failed (${response.status})`,
        response.status,
        response.status === 429 ||
        response.headers.has("retry-after") ||
        response.headers.get("x-ratelimit-remaining") === "0"
          ? "RATE_LIMIT"
          : undefined,
        githubRetryAfterMilliseconds(response),
      );
    }
    const parsed = githubCommentsSchema.safeParse(
      await readGithubJson(response, "GitHub returned an invalid review comments response"),
    );
    if (!parsed.success) {
      throw new GithubAppError("GitHub returned an invalid review comments response");
    }
    const existing = parsed.data.find((comment) => comment.body?.includes(marker));
    if (existing) return existing.id;
    if (parsed.data.length < 100) return undefined;
  }

  throw new GithubAppError("GitHub review comment pagination limit reached");
}

export async function postGithubReviewComment(params: {
  repository: string;
  pullRequestNumber: number;
  token: string;
  commitId: string;
  filePath: string;
  lineNumber: number;
  body: string;
  fetchImpl?: GithubFetch;
}): Promise<number> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.github.com/repos/${repositoryPath(params.repository)}/pulls/${params.pullRequestNumber}/comments`,
    {
      method: "POST",
      headers: { ...githubHeaders(params.token), "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        body: params.body,
        commit_id: params.commitId,
        path: params.filePath,
        line: params.lineNumber,
        side: "RIGHT",
      }),
    },
  );

  if (!response.ok) {
    throw new GithubAppError(
      `GitHub review comment request failed (${response.status})`,
      response.status,
      response.status === 429 ||
      response.headers.has("retry-after") ||
      response.headers.get("x-ratelimit-remaining") === "0"
        ? "RATE_LIMIT"
        : undefined,
      githubRetryAfterMilliseconds(response),
    );
  }
  const parsed = githubCommentSchema.safeParse(
    await readGithubJson(response, "GitHub returned an invalid review comment response"),
  );
  if (!parsed.success) {
    throw new GithubAppError("GitHub returned an invalid review comment response");
  }
  return parsed.data.id;
}

export function formatRuleFindingComment(finding: {
  fingerprint: string;
  title: string;
  evidence: string;
  explanation: string;
  remediation: string;
  severity: string;
  confidence: number;
  markerSecret: string;
}): string {
  return `${findingMarker(finding.fingerprint, finding.markerSecret)}\n**${finding.title}**\n\n**Evidence:** ${finding.evidence}\n\n${finding.explanation}\n\n**Suggested fix:** ${finding.remediation}\n\nSeverity: ${finding.severity.toLowerCase()} · Confidence: ${finding.confidence.toFixed(2)}`;
}
