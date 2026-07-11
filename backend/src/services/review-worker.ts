import { prisma } from "../lib/prisma";
import {
  processReviewRun,
  recordReviewFailure,
  ReviewLeaseLostError,
  type ReviewRunJob,
} from "./review-processor";

const STALE_PROCESSING_MILLISECONDS = 5 * 60_000;

export async function recoverStaleReviewRuns(now = new Date(), database = prisma) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MILLISECONDS);
  const staleRuns = await database.reviewRun.findMany({
    where: {
      state: "PROCESSING",
      startedAt: { lt: staleBefore },
    },
    select: { id: true, deliveryId: true, attemptCount: true, maxAttempts: true },
  });
  let recoveredCount = 0;
  for (const run of staleRuns) {
    const retryable = run.attemptCount < run.maxAttempts;
    const recovered = await database.$transaction(async (transaction) => {
      const updated = await transaction.reviewRun.updateMany({
        where: {
          id: run.id,
          state: "PROCESSING",
          attemptCount: run.attemptCount,
          startedAt: { lt: staleBefore },
        },
        data: {
          state: retryable ? "QUEUED" : "FAILED",
          retryable,
          nextAttemptAt: now,
          failureCategory: "TRANSIENT",
          failureMessage: retryable
            ? "Review worker stopped before completing the attempt"
            : "Review attempts were exhausted after worker interruption",
          completedAt: retryable ? null : now,
        },
      });
      if (updated.count !== 1) return false;
      await transaction.githubWebhookDelivery.update({
        where: { id: run.deliveryId },
        data: {
          state: retryable ? "QUEUED" : "FAILED",
          failureCategory: "TRANSIENT",
          completedAt: retryable ? null : now,
        },
      });
      return true;
    });
    if (recovered) recoveredCount += 1;
  }
  return recoveredCount;
}

export async function claimNextReviewRun(
  now = new Date(),
  database = prisma,
): Promise<ReviewRunJob | undefined> {
  return await database.$transaction(async (transaction) => {
    const candidate = await transaction.reviewRun.findFirst({
      where: { state: "QUEUED", nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!candidate) return undefined;
    const claim = await transaction.reviewRun.updateMany({
      where: { id: candidate.id, state: "QUEUED", nextAttemptAt: { lte: now } },
      data: {
        state: "PROCESSING",
        attemptCount: { increment: 1 },
        startedAt: now,
        completedAt: null,
      },
    });
    if (claim.count === 0) return undefined;
    const run = await transaction.reviewRun.findUniqueOrThrow({
      where: { id: candidate.id },
      include: {
        repository: { include: { installation: true } },
      },
    });
    await transaction.githubWebhookDelivery.update({
      where: { id: run.deliveryId },
      data: { state: "PROCESSING", completedAt: null },
    });
    return run;
  });
}

export async function processNextReviewRun() {
  const run = await claimNextReviewRun();
  if (!run) return false;
  const heartbeat = setInterval(() => {
    void prisma.reviewRun.updateMany({
      where: {
        id: run.id,
        state: "PROCESSING",
        attemptCount: run.attemptCount,
      },
      data: { startedAt: new Date() },
    }).catch(() => undefined);
  }, 30_000);
  try {
    await processReviewRun(run);
  } catch (error) {
    if (error instanceof ReviewLeaseLostError) {
      return true;
    }
    const result = await recordReviewFailure(run, error);
    if (result.recorded) {
      console.error("DiffGuard review attempt failed:", {
        reviewRunId: run.id,
        category: result.category,
        retrying: result.shouldRetry,
      });
    }
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

export function startReviewWorker(params?: {
  pollIntervalMilliseconds?: number;
  maxJobsPerPoll?: number;
}) {
  const pollIntervalMilliseconds = params?.pollIntervalMilliseconds ?? 1_000;
  const maxJobsPerPoll = params?.maxJobsPerPoll ?? 10;
  let stopped = false;
  let active: Promise<void> | undefined;

  const drain = async () => {
    if (stopped || active) return;
    active = (async () => {
      await recoverStaleReviewRuns();
      for (let processed = 0; processed < maxJobsPerPoll && !stopped; processed += 1) {
        if (!await processNextReviewRun()) break;
      }
    })().catch(() => {
      console.error("DiffGuard review worker polling failed.");
    }).finally(() => {
      active = undefined;
    });
    await active;
  };

  const interval = setInterval(() => void drain(), pollIntervalMilliseconds);
  void drain();
  return {
    async stop() {
      stopped = true;
      clearInterval(interval);
      await active;
    },
  };
}
