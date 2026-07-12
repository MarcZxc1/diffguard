import type { FailureCategory, FindingSeverity, Prisma } from "@prisma/client";
import { env } from "../env";
import { parseUnifiedDiff, type ChangedLine } from "../lib/diff-parser";
import {
  createGithubInstallationToken,
  GithubAppError,
  readGithubAppPrivateKey,
} from "../lib/github-app";
import {
  assessGithubFileCoverage,
  createOrUpdateGithubCheckRun,
  fetchGithubPullRequestFiles,
  findGithubReviewCommentByFingerprint,
  formatRuleFindingComment,
  postGithubReviewComment,
  type GithubCheckRunAnnotation,
  type GithubPullRequestFile,
} from "../lib/github-review";
import { prisma } from "../lib/prisma";
import {
  RuleConfigurationError,
  deterministicRules,
  scanPullRequest,
  type RuleFinding,
} from "./rule-engine";
import { runStructuredLlmReview } from "./llm-review.service";

export type ReviewRunJob = {
  id: string;
  deliveryId: string;
  pullRequestNumber: number;
  headSha: string;
  attemptCount: number;
  maxAttempts: number;
  ruleConfiguration: Prisma.JsonValue;
  checkRunId?: bigint | null;
  repository: {
    id: string;
    fullName: string;
    enabled: boolean;
    draftPullRequestPolicy: string;
    checkRunMode: string;
    llmReviewEnabled: boolean;
    llmModel: string;
    installation: {
      githubInstallationId: bigint;
      enabled: boolean;
    };
  };
};

export type FileAnalysis = {
  changedLines: ChangedLine[];
  analyzedFileCount: number;
  skippedFileCount: number;
  partial: boolean;
};

export class ReviewLeaseLostError extends Error {}

async function assertReviewLease(run: ReviewRunJob) {
  const active = await prisma.reviewRun.count({
    where: {
      id: run.id,
      state: "PROCESSING",
      attemptCount: run.attemptCount,
    },
  });
  if (active !== 1) {
    throw new ReviewLeaseLostError("Review attempt no longer owns the processing lease");
  }
}

export function analyzeGithubFiles(params: {
  files: GithubPullRequestFile[];
  paginationComplete: boolean;
}): FileAnalysis {
  const changedLines: ChangedLine[] = [];
  let analyzedFileCount = 0;
  let skippedFileCount = 0;

  for (const file of params.files) {
    const parsedLines = file.patch ? parseUnifiedDiff(file.filename, file.patch) : [];
    const coverage = assessGithubFileCoverage({
      file,
      parsedAdditionCount: parsedLines.filter((line) => line.changeType === "added").length,
      parsedDeletionCount: parsedLines.filter((line) => line.changeType === "removed").length,
    });
    if (coverage.analyzable) {
      analyzedFileCount += 1;
      changedLines.push(...parsedLines);
    } else if (coverage.reason === "truncated_patch") {
      // Available hunks are still useful, but this file cannot be reported as fully covered.
      analyzedFileCount += 1;
      skippedFileCount += 1;
      changedLines.push(...parsedLines);
    } else {
      skippedFileCount += 1;
    }
  }

  return {
    changedLines,
    analyzedFileCount,
    skippedFileCount,
    partial: skippedFileCount > 0 || !params.paginationComplete,
  };
}

const severityRank: Record<FindingSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

async function persistFindings(reviewRunId: string, findings: RuleFinding[]) {
  return await Promise.all(findings.map((finding) =>
    prisma.finding.upsert({
      where: {
        reviewRunId_fingerprint: {
          reviewRunId,
          fingerprint: finding.fingerprint,
        },
      },
      create: {
        reviewRunId,
        fingerprint: finding.fingerprint,
        ruleId: finding.ruleId,
        ruleVersion: finding.ruleVersion,
        source: finding.source,
        category: finding.category,
        severity: finding.severity,
        confidence: finding.confidence,
        filePath: finding.filePath,
        lineNumber: finding.lineNumber,
        title: finding.title,
        evidence: finding.evidence,
        explanation: finding.explanation,
        remediation: finding.remediation,
        suppressed: finding.suppressed,
        suppressionReason: finding.suppressionReason,
        publicationState: finding.suppressed || finding.category === "POLICY"
          ? "SKIPPED"
          : "PENDING",
      },
      update: {
        severity: finding.severity,
        source: finding.source,
        confidence: finding.confidence,
        title: finding.title,
        evidence: finding.evidence,
        explanation: finding.explanation,
        remediation: finding.remediation,
        suppressed: finding.suppressed,
        suppressionReason: finding.suppressionReason,
      },
    })
  ));
}

function summarizeReview(params: {
  state: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  analyzedFileCount: number;
  skippedFileCount: number;
  findings: RuleFinding[];
  llmState: string;
  limitation?: string;
}) {
  const severityCounts = params.findings.reduce<Record<FindingSeverity, number>>((counts, finding) => {
    counts[finding.severity] += 1;
    return counts;
  }, { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
  const counts = (Object.keys(severityRank) as FindingSeverity[])
    .filter((severity) => severityCounts[severity] > 0)
    .sort((left, right) => severityRank[right] - severityRank[left])
    .map((severity) => `${severity}: ${severityCounts[severity]}`)
    .join(", ") || "none";
  const ruleVersions = deterministicRules.map((rule) => `${rule.id}@${rule.version}`).join(", ");
  return [
    `State: ${params.state}`,
    `Analyzed files: ${params.analyzedFileCount}`,
    `Skipped files: ${params.skippedFileCount}`,
    `Findings: ${params.findings.length} (${counts})`,
    `Deterministic rules: ${ruleVersions}`,
    `LLM review: ${params.llmState}`,
    params.limitation ??
      "Limitations: deterministic rules are focused heuristics; branch protection remains advisory until pilot precision is measured.",
  ].join("\n");
}

function checkAnnotations(findings: RuleFinding[]): GithubCheckRunAnnotation[] {
  return findings
    .filter((finding) => finding.category === "SECURITY" && !finding.suppressed)
    .sort((left, right) =>
      severityRank[right.severity] - severityRank[left.severity] ||
      right.confidence - left.confidence
    )
    .slice(0, 50)
    .map((finding) => ({
      path: finding.filePath,
      startLine: finding.lineNumber,
      endLine: finding.lineNumber,
      annotationLevel: severityRank[finding.severity] >= severityRank.HIGH ? "failure" : "warning",
      title: finding.title,
      message: `${finding.evidence}\n\n${finding.remediation}`,
    }));
}

function checkConclusion(params: {
  state: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  findings: RuleFinding[];
  mode: string;
}) {
  if (params.state === "FAILED") return "failure" as const;
  if (params.state === "SKIPPED") return "skipped" as const;
  if (params.state === "PARTIAL") return "neutral" as const;
  const highConfidence = params.findings.some((finding) =>
    finding.category === "SECURITY" &&
    !finding.suppressed &&
    severityRank[finding.severity] >= severityRank.HIGH &&
    finding.confidence >= 0.9
  );
  return params.mode === "ENFORCING" && highConfidence ? "failure" as const : "success" as const;
}

async function publishCheckRun(params: {
  run: ReviewRunJob;
  token: string;
  status: "queued" | "in_progress" | "completed";
  title: string;
  summary: string;
  conclusion?: "success" | "neutral" | "failure" | "skipped";
  annotations?: GithubCheckRunAnnotation[];
}) {
  const checkRun = await createOrUpdateGithubCheckRun({
    repository: params.run.repository.fullName,
    token: params.token,
    headSha: params.run.headSha,
    status: params.status,
    conclusion: params.conclusion,
    title: params.title,
    summary: params.summary,
    annotations: params.annotations,
    checkRunId: params.run.checkRunId,
  });
  params.run.checkRunId = checkRun.id;
  await prisma.reviewRun.updateMany({
    where: { id: params.run.id, attemptCount: params.run.attemptCount },
    data: {
      checkRunId: checkRun.id,
      checkRunUrl: checkRun.url,
      checkRunStatus: params.status,
      checkRunConclusion: params.conclusion ?? null,
      reviewSummary: params.summary,
    },
  });
}

export async function processReviewRun(run: ReviewRunJob) {
  if (!run.repository.enabled || !run.repository.installation.enabled) {
    throw new RuleConfigurationError("Repository or installation is disabled");
  }
  if (!env.GITHUB_APP_ID) {
    throw new RuleConfigurationError("GitHub App ID is not configured");
  }
  const privateKey = readGithubAppPrivateKey({
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
    privateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH,
  });
  const installationToken = await createGithubInstallationToken({
    installationId: run.repository.installation.githubInstallationId,
    appId: env.GITHUB_APP_ID,
    privateKey,
  });
  await publishCheckRun({
    run,
    token: installationToken.token,
    status: "queued",
    title: "DiffGuard queued",
    summary: "DiffGuard accepted this pull request revision and queued it for analysis.",
  });
  await publishCheckRun({
    run,
    token: installationToken.token,
    status: "in_progress",
    title: "DiffGuard analysis in progress",
    summary: "DiffGuard is fetching changed files and running configured review rules.",
  });
  const fetched = await fetchGithubPullRequestFiles({
    repository: run.repository.fullName,
    pullRequestNumber: run.pullRequestNumber,
    token: installationToken.token,
  });
  const analysis = analyzeGithubFiles(fetched);
  const deterministicFindings = scanPullRequest({
    context: {
      headSha: run.headSha,
      files: fetched.files.map((file) => ({
        filename: file.filename,
        status: file.status,
      })),
      changedLines: analysis.changedLines,
    },
    configuration: run.ruleConfiguration,
  });
  const llmReview = await runStructuredLlmReview({
    enabled: run.repository.llmReviewEnabled,
    model: run.repository.llmModel,
    headSha: run.headSha,
    changedLines: analysis.changedLines,
    deterministicFindings,
  });
  const findings = [
    ...deterministicFindings,
    ...llmReview.findings.filter((finding) =>
      !deterministicFindings.some((existing) =>
        existing.filePath === finding.filePath &&
        existing.lineNumber === finding.lineNumber &&
        existing.title.toLowerCase() === finding.title.toLowerCase()
      )
    ),
  ];
  await assertReviewLease(run);
  const records = await persistFindings(run.id, findings);
  const publishable = records
    .filter((finding) =>
      finding.category === "SECURITY" &&
      !finding.suppressed &&
      finding.publicationState !== "POSTED"
    )
    .sort((left, right) =>
      severityRank[right.severity] - severityRank[left.severity] ||
      right.confidence - left.confidence
    );
  const remainingCommentSlots = Math.max(
    0,
    3 - records.filter((finding) => finding.publicationState === "POSTED").length,
  );

  for (const finding of publishable.slice(remainingCommentSlots)) {
    await prisma.finding.update({
      where: { id: finding.id },
      data: { publicationState: "SKIPPED" },
    });
  }

  for (const finding of publishable.slice(0, remainingCommentSlots)) {
    await assertReviewLease(run);
    const existingCommentId = await findGithubReviewCommentByFingerprint({
      repository: run.repository.fullName,
      pullRequestNumber: run.pullRequestNumber,
      token: installationToken.token,
      fingerprint: finding.fingerprint,
      markerSecret: env.GITHUB_WEBHOOK_SECRET,
    });
    const githubCommentId = existingCommentId ?? await postGithubReviewComment({
      repository: run.repository.fullName,
      pullRequestNumber: run.pullRequestNumber,
      token: installationToken.token,
      commitId: run.headSha,
      filePath: finding.filePath,
      lineNumber: finding.lineNumber,
      body: formatRuleFindingComment({
        ...finding,
        markerSecret: env.GITHUB_WEBHOOK_SECRET,
      }),
    });
    await prisma.finding.update({
      where: { id: finding.id },
      data: {
        publicationState: "POSTED",
        githubCommentId: BigInt(githubCommentId),
      },
    });
  }

  const completedAt = new Date();
  const finalState = analysis.partial ? "PARTIAL" : "SUCCEEDED";
  const summary = summarizeReview({
    state: finalState,
    analyzedFileCount: analysis.analyzedFileCount,
    skippedFileCount: analysis.skippedFileCount,
    findings,
    llmState: llmReview.state,
    limitation: analysis.partial
      ? "Limitations: some files were skipped or patch pagination was incomplete, so this is not complete coverage."
      : undefined,
  });
  await assertReviewLease(run);
  await publishCheckRun({
    run,
    token: installationToken.token,
    status: "completed",
    title: finalState === "PARTIAL" ? "DiffGuard completed with partial coverage" : "DiffGuard completed",
    summary,
    conclusion: checkConclusion({
      state: finalState,
      findings,
      mode: run.repository.checkRunMode,
    }),
    annotations: checkAnnotations(findings),
  });
  await prisma.$transaction(async (transaction) => {
    const completed = await transaction.reviewRun.updateMany({
      where: {
        id: run.id,
        state: "PROCESSING",
        attemptCount: run.attemptCount,
      },
      data: {
        state: finalState,
        retryable: false,
        failureCategory: null,
        failureMessage: null,
        reviewSummary: summary,
        llmState: llmReview.state,
        llmFailureMessage: llmReview.failureMessage ?? null,
        completedAt,
        analyzedFileCount: analysis.analyzedFileCount,
        skippedFileCount: analysis.skippedFileCount,
        findingCount: findings.length,
        suppressedFindingCount: findings.filter((finding) => finding.suppressed).length,
      },
    });
    if (completed.count !== 1) {
      throw new ReviewLeaseLostError("Review attempt lost its lease before completion");
    }
    await transaction.githubWebhookDelivery.update({
      where: { id: run.deliveryId },
      data: { state: "SUCCEEDED", failureCategory: null, completedAt },
    });
  });
}

export type SanitizedReviewFailure = {
  category: FailureCategory;
  message: string;
  retryable: boolean;
  retryAfterMilliseconds?: number;
};

export function classifyReviewFailure(error: unknown): SanitizedReviewFailure {
  if (error instanceof RuleConfigurationError) {
    return {
      category: "CONFIGURATION",
      message: "Review configuration is invalid or disabled",
      retryable: false,
    };
  }
  if (error instanceof GithubAppError) {
    const status = error.statusCode;
    if (error.categoryHint === "RATE_LIMIT") {
      return {
        category: "RATE_LIMIT",
        message: "GitHub rate limit delayed the review",
        retryable: true,
        ...(error.retryAfterMilliseconds === undefined
          ? {}
          : { retryAfterMilliseconds: error.retryAfterMilliseconds }),
      };
    }
    if (status === 401 || status === 403) {
      return { category: "AUTHORIZATION", message: "GitHub authorization failed", retryable: false };
    }
    if (status === 404) {
      return { category: "NOT_FOUND", message: "GitHub review resource was not found", retryable: false };
    }
    if (status === 422) {
      return { category: "STALE_COMMIT", message: "GitHub rejected a review location", retryable: false };
    }
    if (status === 429) {
      return { category: "RATE_LIMIT", message: "GitHub rate limit delayed the review", retryable: true };
    }
    if (status === 408 || (status !== undefined && status >= 500)) {
      return { category: "UPSTREAM", message: "GitHub is temporarily unavailable", retryable: true };
    }
    if (status === undefined && /invalid|pagination limit/i.test(error.message)) {
      return { category: "INVALID_RESPONSE", message: "GitHub returned an unusable response", retryable: false };
    }
    return { category: "CONFIGURATION", message: "GitHub App configuration failed", retryable: false };
  }
  if (error instanceof TypeError) {
    return { category: "TRANSIENT", message: "A transient network error interrupted the review", retryable: true };
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return { category: "TRANSIENT", message: "A GitHub request timed out", retryable: true };
  }
  return { category: "INTERNAL", message: "An internal review error occurred", retryable: false };
}

export function retryDelayMilliseconds(attemptCount: number) {
  return Math.min(60_000, 2_000 * (2 ** Math.max(0, attemptCount - 1)));
}

export function buildFailureTransition(params: {
  attemptCount: number;
  maxAttempts: number;
  error: unknown;
  now?: Date;
}) {
  const failure = classifyReviewFailure(params.error);
  const shouldRetry = failure.retryable && params.attemptCount < params.maxAttempts;
  const now = params.now ?? new Date();
  return {
    ...failure,
    shouldRetry,
    nextAttemptAt: shouldRetry
      ? new Date(now.getTime() + Math.max(
        retryDelayMilliseconds(params.attemptCount),
        failure.retryAfterMilliseconds ?? 0,
      ))
      : now,
  };
}

export async function recordReviewFailure(run: ReviewRunJob, error: unknown) {
  const now = new Date();
  const transition = buildFailureTransition({
    attemptCount: run.attemptCount,
    maxAttempts: run.maxAttempts,
    error,
    now,
  });
  if (!transition.shouldRetry && env.GITHUB_APP_ID && run.checkRunId) {
    try {
      const privateKey = readGithubAppPrivateKey({
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        privateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH,
      });
      const installationToken = await createGithubInstallationToken({
        installationId: run.repository.installation.githubInstallationId,
        appId: env.GITHUB_APP_ID,
        privateKey,
      });
      await publishCheckRun({
        run,
        token: installationToken.token,
        status: "completed",
        title: "DiffGuard failed",
        summary: summarizeReview({
          state: "FAILED",
          analyzedFileCount: 0,
          skippedFileCount: 0,
          findings: [],
          llmState: "SKIPPED",
          limitation: `Failure: ${transition.message}`,
        }),
        conclusion: "failure",
      });
    } catch {
      // Failure reporting is best effort; the durable sanitized failure below is authoritative.
    }
  }
  const recorded = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.reviewRun.updateMany({
      where: {
        id: run.id,
        state: "PROCESSING",
        attemptCount: run.attemptCount,
      },
      data: {
        state: transition.shouldRetry ? "QUEUED" : "FAILED",
        retryable: transition.shouldRetry,
        failureCategory: transition.category,
        failureMessage: transition.message,
        nextAttemptAt: transition.nextAttemptAt,
        completedAt: transition.shouldRetry ? null : now,
      },
    });
    if (updated.count !== 1) return false;
    await transaction.githubWebhookDelivery.update({
      where: { id: run.deliveryId },
      data: {
        state: transition.shouldRetry ? "QUEUED" : "FAILED",
        failureCategory: transition.category,
        completedAt: transition.shouldRetry ? null : now,
      },
    });
    return true;
  });
  return { ...transition, recorded };
}
