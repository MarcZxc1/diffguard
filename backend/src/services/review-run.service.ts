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
      id: true,
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
      pilotVerification: true,
      pilotVerifiedAt: true,
      pilotNotes: true,
      publicationState: true,
      githubCommentId: true,
    },
  },
} satisfies Prisma.ReviewRunSelect;

type ReviewRunRecord = Prisma.ReviewRunGetPayload<{
  select: typeof reviewRunSelect;
}>;

export function serializeReviewRun(record: ReviewRunRecord) {
  return {
    ...record,
    checkRunId: record.checkRunId?.toString() ?? null,
    findings: record.findings.map((finding) => ({
      ...finding,
      githubCommentId: finding.githubCommentId?.toString() ?? null,
    })),
  };
}

export const reviewRunService = {
  async getById(id: string) {
    const reviewRun = await prisma.reviewRun.findUnique({
      where: { id },
      select: reviewRunSelect,
    });
    if (!reviewRun) return null;
    return serializeReviewRun(reviewRun);
  },
};
