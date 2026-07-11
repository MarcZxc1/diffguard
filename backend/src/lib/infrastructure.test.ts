import { describe, expect, it } from "bun:test";
import {
  connectInfrastructure,
  disconnectInfrastructure,
  type Infrastructure,
} from "./infrastructure";

function createInfrastructure(overrides?: {
  redisStatus?: string;
  redisConnect?: () => Promise<unknown>;
}) {
  const calls: string[] = [];
  const infrastructure: Infrastructure = {
    prisma: {
      async $connect() {
        calls.push("prisma:connect");
      },
      async $disconnect() {
        calls.push("prisma:disconnect");
      },
    },
    redis: {
      status: overrides?.redisStatus ?? "wait",
      async connect() {
        calls.push("redis:connect");
        return await (overrides?.redisConnect?.() ?? Promise.resolve());
      },
      async quit() {
        calls.push("redis:quit");
      },
      disconnect() {
        calls.push("redis:disconnect");
      },
    },
  };

  return { calls, infrastructure };
}

describe("application infrastructure lifecycle", () => {
  it("connects Postgres before Redis", async () => {
    const { calls, infrastructure } = createInfrastructure();

    await connectInfrastructure(infrastructure);

    expect(calls).toEqual(["prisma:connect", "redis:connect"]);
  });

  it("disconnects Postgres if Redis startup fails", async () => {
    const { calls, infrastructure } = createInfrastructure({
      redisConnect: async () => {
        throw new Error("Redis unavailable");
      },
    });

    await expect(connectInfrastructure(infrastructure)).rejects.toThrow(
      "Redis unavailable",
    );
    expect(calls).toEqual([
      "prisma:connect",
      "redis:connect",
      "prisma:disconnect",
    ]);
  });

  it("closes active Redis and Prisma connections", async () => {
    const { calls, infrastructure } = createInfrastructure({
      redisStatus: "ready",
    });

    await disconnectInfrastructure(infrastructure);

    expect(calls).toContain("redis:quit");
    expect(calls).toContain("prisma:disconnect");
  });
});
