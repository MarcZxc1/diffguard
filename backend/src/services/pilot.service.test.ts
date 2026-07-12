import { describe, test, expect } from "bun:test";
import type { prisma as prismaClient } from "../lib/prisma";
import { verifyFinding, computeRulePrecision } from "./pilot.service";

describe("pilot finding verification", () => {
  test("rejects invalid verification status", () => {
    expect(() =>
      verifyFinding.parseInput({ verification: "INVALID", notes: "" })
    ).toThrow();
  });

  test("accepts CONFIRMED verification", () => {
    const parsed = verifyFinding.parseInput({
      verification: "CONFIRMED",
      notes: "Verified in code review",
    });
    expect(parsed.verification).toBe("CONFIRMED");
    expect(parsed.notes).toBe("Verified in code review");
  });

  test("accepts FALSE_POSITIVE verification", () => {
    const parsed = verifyFinding.parseInput({
      verification: "FALSE_POSITIVE",
      notes: "Test fixture, not a real secret",
    });
    expect(parsed.verification).toBe("FALSE_POSITIVE");
  });

  test("updates and audits findings only when they belong to the requested repository", async () => {
    const calls: unknown[] = [];
    const database = {
      finding: {
        async findFirst(query: unknown) {
          calls.push({ findFirst: query });
          return {
            id: "finding-1",
            reviewRunId: "run-1",
            reviewRun: { repositoryId: "repo-1" },
          };
        },
        async update(query: unknown) {
          calls.push({ update: query });
          return { id: "finding-1", pilotVerification: "CONFIRMED" };
        },
      },
      auditLog: {
        async create(query: unknown) {
          calls.push({ audit: query });
        },
      },
    } as unknown as typeof prismaClient;

    const result = await verifyFinding.execute(
      "repo-1",
      "finding-1",
      { verification: "CONFIRMED" },
      { id: "user-1", role: "USER" },
      database,
    );

    expect(result?.id).toBe("finding-1");
    expect(result?.pilotVerification).toBe("CONFIRMED");
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      findFirst: {
        where: { id: "finding-1", reviewRun: { repositoryId: "repo-1" } },
        select: {
          id: true,
          reviewRunId: true,
          reviewRun: { select: { repositoryId: true } },
        },
      },
    });
  });

  test("does not update or audit a finding outside the requested repository", async () => {
    const calls: unknown[] = [];
    const database = {
      finding: {
        async findFirst(query: unknown) {
          calls.push({ findFirst: query });
          return null;
        },
        async update(query: unknown) {
          calls.push({ update: query });
          return query;
        },
      },
      auditLog: {
        async create(query: unknown) {
          calls.push({ audit: query });
        },
      },
    } as unknown as typeof prismaClient;

    const result = await verifyFinding.execute(
      "repo-1",
      "finding-from-another-repo",
      { verification: "FALSE_POSITIVE" },
      { id: "user-1", role: "USER" },
      database,
    );

    expect(result).toBeNull();
    expect(calls).toEqual([
      {
        findFirst: {
          where: {
            id: "finding-from-another-repo",
            reviewRun: { repositoryId: "repo-1" },
          },
          select: {
            id: true,
            reviewRunId: true,
            reviewRun: { select: { repositoryId: true } },
          },
        },
      },
    ]);
  });
});

describe("pilot precision computation", () => {
  test("computes precision from verified findings", () => {
    const findings = [
      { pilotVerification: "CONFIRMED" },
      { pilotVerification: "CONFIRMED" },
      { pilotVerification: "FALSE_POSITIVE" },
      { pilotVerification: null },
    ];
    const precision = computeRulePrecision(findings as any);
    expect(precision.confirmedCount).toBe(2);
    expect(precision.falsePositiveCount).toBe(1);
    expect(precision.unverifiedCount).toBe(1);
    expect(precision.precision).toBeCloseTo(0.667, 2);
  });

  test("returns precision 0 when no findings are verified", () => {
    const precision = computeRulePrecision([]);
    expect(precision.precision).toBe(0);
  });
});
