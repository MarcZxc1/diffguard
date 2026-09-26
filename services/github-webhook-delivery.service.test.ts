import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import type { prisma as prismaClient } from "../lib/prisma";
import {
  acceptGithubPullRequestDelivery,
  type PullRequestDeliveryInput,
} from "./github-webhook-delivery.service";

const input: PullRequestDeliveryInput = {
  deliveryId: "delivery-123",
  eventType: "pull_request",
  installationId: 123,
  accountLogin: "owner",
  repositoryId: 456,
  repositoryOwner: "owner",
  repositoryName: "repo",
  repositoryFullName: "owner/repo",
  pullRequestNumber: 7,
  headSha: "abc1234",
  action: "opened",
  isDraft: false,
};

function databaseFor(params?: { installationEnabled?: boolean; repositoryEnabled?: boolean }) {
  const calls: string[] = [];
  const transaction = {
    githubInstallation: {
      async upsert() {
        calls.push("installation");
        return { id: "installation-1", enabled: params?.installationEnabled ?? true };
      },
    },
    githubRepository: {
      async upsert() {
        calls.push("repository");
        return { id: "repository-1", enabled: params?.repositoryEnabled ?? true };
      },
    },
    reviewRun: {
      async findFirst() {
        return null;
      },
    },
    githubWebhookDelivery: {
      async create() {
        calls.push("delivery");
        return { reviewRun: { id: "run-1" } };
      },
    },
  };
  const database = {
    async $transaction(callback: (value: typeof transaction) => unknown) {
      return await callback(transaction);
    },
  } as unknown as typeof prismaClient;
  return { calls, database };
}

describe("acceptGithubPullRequestDelivery", () => {
  it("persists installation, repository, delivery, and queued run atomically", async () => {
    const { calls, database } = databaseFor();
    await expect(acceptGithubPullRequestDelivery(input, database)).resolves.toEqual({
      kind: "queued",
      reviewRunId: "run-1",
      state: "QUEUED",
    });
    expect(calls).toEqual(["installation", "repository", "delivery"]);
  });

  it("does not queue work for a disabled repository", async () => {
    const { calls, database } = databaseFor({ repositoryEnabled: false });
    await expect(acceptGithubPullRequestDelivery(input, database)).resolves.toEqual({
      kind: "disabled",
    });
    expect(calls).toEqual(["installation", "repository"]);
  });

  it("records a skipped review for draft pull requests when repository policy skips drafts", async () => {
    const transaction = {
      githubInstallation: {
        async upsert() {
          return { id: "installation-1", enabled: true };
        },
      },
      githubRepository: {
        async upsert() {
          return { id: "repository-1", enabled: true, draftPullRequestPolicy: "SKIP" };
        },
      },
      reviewRun: {
        async findFirst() {
          return null;
        },
      },
      githubWebhookDelivery: {
        async create() {
          return { reviewRun: { id: "run-1" } };
        },
      },
    };
    const draftDatabase = {
      async $transaction(callback: (value: typeof transaction) => unknown) {
        return await callback(transaction);
      },
    } as unknown as typeof prismaClient;

    await expect(acceptGithubPullRequestDelivery({
      ...input,
      isDraft: true,
    }, draftDatabase)).resolves.toEqual({
      kind: "skipped",
      reviewRunId: "run-1",
      state: "SKIPPED",
      reason: "draft_pull_request",
    });
  });

  it("requeues a recorded retryable failure instead of treating it as success", async () => {
    let transactionCount = 0;
    const database = {
      async $transaction(callback: (transaction: unknown) => unknown) {
        transactionCount += 1;
        if (transactionCount === 1) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "7.8.0",
          });
        }
        return await callback({
          reviewRun: { async updateMany() { return { count: 1 }; } },
          githubWebhookDelivery: { async update() { return {}; } },
        });
      },
      githubWebhookDelivery: {
        async findUnique() {
          return {
            id: "delivery-db-id",
            reviewRun: {
              id: "run-1",
              state: "FAILED",
              retryable: true,
              attemptCount: 1,
              maxAttempts: 3,
            },
          };
        },
      },
    } as unknown as typeof prismaClient;

    await expect(acceptGithubPullRequestDelivery(input, database)).resolves.toEqual({
      kind: "requeued",
      reviewRunId: "run-1",
      state: "QUEUED",
    });
    expect(transactionCount).toBe(2);
  });

  it("does not create another review run for the same PR revision", async () => {
    const calls: string[] = [];
    const transaction = {
      githubInstallation: {
        async upsert() {
          return { id: "installation-1", enabled: true };
        },
      },
      githubRepository: {
        async upsert() {
          return { id: "repository-1", enabled: true, draftPullRequestPolicy: "SKIP" };
        },
      },
      reviewRun: {
        async findFirst() {
          calls.push("find-existing-run");
          return {
            id: "run-existing",
            state: "PARTIAL",
            retryable: false,
            attemptCount: 1,
            maxAttempts: 3,
          };
        },
      },
      githubWebhookDelivery: {
        async create() {
          calls.push("delivery-only");
          return {};
        },
      },
    };
    const database = {
      async $transaction(callback: (value: typeof transaction) => unknown) {
        return await callback(transaction);
      },
    } as unknown as typeof prismaClient;

    await expect(acceptGithubPullRequestDelivery(input, database)).resolves.toEqual({
      kind: "duplicate",
      reviewRunId: "run-existing",
      state: "PARTIAL",
    });
    expect(calls).toEqual(["find-existing-run", "delivery-only"]);
  });

  it("requeues a skipped draft revision when GitHub marks it ready for review", async () => {
    const calls: string[] = [];
    const transaction = {
      githubInstallation: {
        async upsert() {
          return { id: "installation-1", enabled: true };
        },
      },
      githubRepository: {
        async upsert() {
          return { id: "repository-1", enabled: true, draftPullRequestPolicy: "SKIP" };
        },
      },
      reviewRun: {
        async findFirst() {
          return {
            id: "run-existing",
            state: "SKIPPED",
            retryable: false,
            attemptCount: 0,
            maxAttempts: 3,
          };
        },
        async update() {
          calls.push("requeue-run");
          return {};
        },
      },
      githubWebhookDelivery: {
        async create() {
          calls.push("delivery-only");
          return {};
        },
      },
    };
    const database = {
      async $transaction(callback: (value: typeof transaction) => unknown) {
        return await callback(transaction);
      },
    } as unknown as typeof prismaClient;

    await expect(acceptGithubPullRequestDelivery({
      ...input,
      action: "ready_for_review",
      isDraft: false,
    }, database)).resolves.toEqual({
      kind: "requeued",
      reviewRunId: "run-existing",
      state: "QUEUED",
    });
    expect(calls).toEqual(["requeue-run", "delivery-only"]);
  });
});
