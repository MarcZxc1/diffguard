import { describe, expect, it } from "bun:test";
import type { prisma as prismaClient } from "../lib/prisma";
import { claimNextReviewRun, recoverStaleReviewRuns } from "./review-worker";

function databaseForClaim(claimCount: number) {
  const calls: string[] = [];
  const run = {
    id: "run-1",
    deliveryId: "delivery-db-id",
    pullRequestNumber: 4,
    headSha: "abcdef123456",
    ruleConfiguration: {},
    attemptCount: 1,
    maxAttempts: 3,
    repository: {
      id: "repository-1",
      fullName: "owner/repo",
      enabled: true,
      installation: { githubInstallationId: 123n, enabled: true },
    },
  };
  const transaction = {
    reviewRun: {
      async findFirst() {
        calls.push("find");
        return { id: "run-1" };
      },
      async updateMany() {
        calls.push("claim");
        return { count: claimCount };
      },
      async findUniqueOrThrow() {
        calls.push("load");
        return run;
      },
    },
    githubWebhookDelivery: {
      async update() {
        calls.push("delivery");
        return {};
      },
    },
  };
  const database = {
    async $transaction(callback: (value: typeof transaction) => unknown) {
      return await callback(transaction);
    },
  } as unknown as typeof prismaClient;
  return { calls, database, run };
}

describe("claimNextReviewRun", () => {
  it("atomically claims and loads one due review run", async () => {
    const { calls, database, run } = databaseForClaim(1);
    await expect(
      claimNextReviewRun(new Date("2026-07-12T00:00:00Z"), database),
    ).resolves.toEqual(run);
    expect(calls).toEqual(["find", "claim", "load", "delivery"]);
  });

  it("does not process a run won by another worker", async () => {
    const { calls, database } = databaseForClaim(0);
    await expect(claimNextReviewRun(new Date(), database)).resolves.toBeUndefined();
    expect(calls).toEqual(["find", "claim"]);
  });
});

describe("recoverStaleReviewRuns", () => {
  it("does not reclaim an attempt whose heartbeat won the race", async () => {
    let deliveryUpdated = false;
    const transaction = {
      reviewRun: { async updateMany() { return { count: 0 }; } },
      githubWebhookDelivery: {
        async update() {
          deliveryUpdated = true;
          return {};
        },
      },
    };
    const database = {
      reviewRun: {
        async findMany() {
          return [{
            id: "run-1",
            deliveryId: "delivery-1",
            attemptCount: 1,
            maxAttempts: 3,
          }];
        },
      },
      async $transaction(callback: (value: typeof transaction) => unknown) {
        return await callback(transaction);
      },
    } as unknown as typeof prismaClient;

    await expect(recoverStaleReviewRuns(new Date(), database)).resolves.toBe(0);
    expect(deliveryUpdated).toBe(false);
  });
});
