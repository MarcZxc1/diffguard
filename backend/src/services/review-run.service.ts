import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const reviewRunSelect = {
  id: true,
  repositoryId: true,
  pullRequestNumber: true,
  headSha: true,
  state: true,
  attemptCount: true,
  maxAttempts: true,
  retryable: true,
  failureCategory: true,
  failureMessage: true,
  checkRunId: true,
  checkRunUrl: true,
  checkRunStatus: true,
  checkRunConclusion: true,
  reviewSummary: true,
  llmState: true,
  llmFailureMessage: true,
  rerunReason: true,
  startedAt: true,
  completedAt: true,
  analyzedFileCount: true,
  skippedFileCount: true,
  findingCount: true,
  suppressedFindingCount: true,
  createdAt: true,
  updatedAt: true,
  repository: { select: { fullName: true } },
  findings: {
    orderBy: [{ severity: "desc" }, { filePath: "asc" }, { lineNumber: "asc" }],
    select: {
      fingerprint: true,
      ruleId: true,
      ruleVersion: true,
      source: true,
      category: true,
      severity: true,
      confidence: true,
      filePath: true,
      lineNumber: true,
      title: true,
      evidence: true,
      explanation: true,
      remediation: true,
      suppressed: true,
      suppressionReason: true,
      publicationState: true,
      githubCommentId: true,
    },
  },
} satisfies Prisma.ReviewRunSelect;

export const reviewRunService = {
  async getById(id: string) {
    const reviewRun = await prisma.reviewRun.findUnique({
      where: { id },
      select: reviewRunSelect,
    });
    if (!reviewRun) return null;
    return {
      ...reviewRun,
      findings: reviewRun.findings.map((finding) => ({
        ...finding,
        githubCommentId: finding.githubCommentId?.toString() ?? null,
      })),
    };
  },
};
