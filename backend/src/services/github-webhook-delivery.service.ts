import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type PullRequestDeliveryInput = {
  deliveryId: string;
  eventType: "pull_request";
  installationId: number;
  accountLogin?: string;
  repositoryId: number;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  action: "opened" | "synchronize" | "reopened" | "ready_for_review";
  isDraft: boolean;
};

export type DeliveryAcceptance =
  | { kind: "queued" | "requeued"; reviewRunId: string; state: "QUEUED" }
  | { kind: "duplicate"; reviewRunId: string; state: string }
  | { kind: "skipped"; reviewRunId: string; state: "SKIPPED"; reason: string }
  | { kind: "disabled" };

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function deliveryStateForReviewRun(state: string): "QUEUED" | "PROCESSING" | "SUCCEEDED" | "SKIPPED" | "FAILED" {
  if (state === "PARTIAL") return "SUCCEEDED";
  if (state === "SKIPPED") return "SKIPPED";
  if (state === "FAILED") return "FAILED";
  if (state === "PROCESSING") return "PROCESSING";
  return state === "QUEUED" ? "QUEUED" : "SUCCEEDED";
}

export async function acceptGithubPullRequestDelivery(
  input: PullRequestDeliveryInput,
  database = prisma,
): Promise<DeliveryAcceptance> {
  try {
    return await database.$transaction(async (transaction) => {
      const installation = await transaction.githubInstallation.upsert({
        where: { githubInstallationId: BigInt(input.installationId) },
        create: {
          githubInstallationId: BigInt(input.installationId),
          accountLogin: input.accountLogin,
        },
        update: { accountLogin: input.accountLogin },
      });
      const repository = await transaction.githubRepository.upsert({
        where: { githubRepositoryId: BigInt(input.repositoryId) },
        create: {
          githubRepositoryId: BigInt(input.repositoryId),
          installationId: installation.id,
          owner: input.repositoryOwner,
          name: input.repositoryName,
          fullName: input.repositoryFullName,
        },
        update: {
          installationId: installation.id,
          owner: input.repositoryOwner,
          name: input.repositoryName,
          fullName: input.repositoryFullName,
        },
      });

      if (!installation.enabled || !repository.enabled) {
        return { kind: "disabled" as const };
      }
      const shouldSkipDraft = input.isDraft && repository.draftPullRequestPolicy === "SKIP";
      const existingRevision = await transaction.reviewRun.findFirst({
        where: {
          repositoryId: repository.id,
          pullRequestNumber: input.pullRequestNumber,
          headSha: input.headSha,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          state: true,
          retryable: true,
          attemptCount: true,
          maxAttempts: true,
        },
      });
      if (existingRevision) {
        const shouldRequeueExisting =
          (existingRevision.state === "FAILED" && existingRevision.retryable && existingRevision.attemptCount < existingRevision.maxAttempts) ||
          (existingRevision.state === "SKIPPED" && input.action === "ready_for_review" && !input.isDraft);
        if (shouldRequeueExisting) {
          await transaction.reviewRun.update({
            where: { id: existingRevision.id },
            data: {
              state: "QUEUED",
              retryable: true,
              nextAttemptAt: new Date(),
              failureCategory: null,
              failureMessage: null,
              completedAt: null,
              reviewSummary: null,
              rerunReason: input.action === "ready_for_review" ? "ready_for_review" : "duplicate_revision_retry",
            },
          });
          await transaction.githubWebhookDelivery.create({
            data: {
              deliveryId: input.deliveryId,
              eventType: input.eventType,
              state: "QUEUED",
            },
          });
          return {
            kind: "requeued" as const,
            reviewRunId: existingRevision.id,
            state: "QUEUED" as const,
          };
        }
        await transaction.githubWebhookDelivery.create({
          data: {
            deliveryId: input.deliveryId,
            eventType: input.eventType,
            state: deliveryStateForReviewRun(existingRevision.state),
            completedAt: ["SUCCEEDED", "PARTIAL", "SKIPPED", "FAILED"].includes(existingRevision.state)
              ? new Date()
              : null,
          },
        });
        return {
          kind: "duplicate" as const,
          reviewRunId: existingRevision.id,
          state: existingRevision.state,
        };
      }

      const delivery = await transaction.githubWebhookDelivery.create({
        data: {
          deliveryId: input.deliveryId,
          eventType: input.eventType,
          state: shouldSkipDraft ? "SKIPPED" : "QUEUED",
          completedAt: shouldSkipDraft ? new Date() : null,
          reviewRun: {
            create: {
              repositoryId: repository.id,
              pullRequestNumber: input.pullRequestNumber,
              headSha: input.headSha,
              ruleConfiguration: repository.ruleConfiguration as Prisma.InputJsonValue,
              state: shouldSkipDraft ? "SKIPPED" : "QUEUED",
              retryable: !shouldSkipDraft,
              reviewSummary: shouldSkipDraft
                ? "Skipped because this repository is configured to ignore draft pull requests."
                : null,
              completedAt: shouldSkipDraft ? new Date() : null,
            },
          },
        },
        include: { reviewRun: true },
      });
      if (!delivery.reviewRun) {
        throw new Error("Queued delivery did not create a review run");
      }
      if (shouldSkipDraft) {
        return {
          kind: "skipped" as const,
          reviewRunId: delivery.reviewRun.id,
          state: "SKIPPED" as const,
          reason: "draft_pull_request",
        };
      }
      return {
        kind: "queued" as const,
        reviewRunId: delivery.reviewRun.id,
        state: "QUEUED" as const,
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await database.githubWebhookDelivery.findUnique({
    where: { deliveryId: input.deliveryId },
    include: { reviewRun: true },
  });
  if (!existing?.reviewRun) {
    throw new Error("Unique constraint conflict was not a duplicate delivery");
  }

  if (
    existing.reviewRun.state === "FAILED" &&
    existing.reviewRun.retryable &&
    existing.reviewRun.attemptCount < existing.reviewRun.maxAttempts
  ) {
    const requeued = await database.$transaction(async (transaction) => {
      const result = await transaction.reviewRun.updateMany({
        where: {
          id: existing.reviewRun!.id,
          state: "FAILED",
          retryable: true,
        },
        data: {
          state: "QUEUED",
          nextAttemptAt: new Date(),
          failureCategory: null,
          failureMessage: null,
          completedAt: null,
        },
      });
      if (result.count === 1) {
        await transaction.githubWebhookDelivery.update({
          where: { id: existing.id },
          data: { state: "QUEUED", failureCategory: null, completedAt: null },
        });
      }
      return result;
    });
    if (requeued.count === 1) {
      return {
        kind: "requeued",
        reviewRunId: existing.reviewRun.id,
        state: "QUEUED",
      };
    }
  }

  const current = await database.reviewRun.findUniqueOrThrow({
    where: { id: existing.reviewRun.id },
    select: { state: true },
  });
  return {
    kind: "duplicate",
    reviewRunId: existing.reviewRun.id,
    state: current.state,
  };
}

export const githubWebhookDeliveryService = {
  accept: acceptGithubPullRequestDelivery,
};
