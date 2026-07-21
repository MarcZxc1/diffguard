import { describe, test, expect } from "bun:test";
import type { prisma as prismaClient } from "../lib/prisma";
import {
  computePilotReadiness,
  computeRulePrecision,
  getPilotPrecisionByRule,
  verifyFinding,
} from "./pilot.service";

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

  test("uses only unsuppressed deterministic security findings and separates rule versions", async () => {
    let query: unknown;
    const database = {
      finding: {
        async findMany(input: unknown) {
          query = input;
          return [
            { ruleId: "security.test", ruleVersion: "1.0.0", pilotVerification: "CONFIRMED" },
            { ruleId: "security.test", ruleVersion: "2.0.0", pilotVerification: "FALSE_POSITIVE" },
          ];
        },
      },
    } as unknown as typeof prismaClient;

    const rules = await getPilotPrecisionByRule("repo-1", database);

    expect(query).toEqual({
      where: {
        reviewRun: { repositoryId: "repo-1" },
        category: "SECURITY",
        source: "DETERMINISTIC",
        suppressed: false,
      },
      select: { ruleId: true, ruleVersion: true, pilotVerification: true },
    });
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ ruleVersion: "1.0.0", precision: 1 });
    expect(rules[1]).toMatchObject({ ruleVersion: "2.0.0", precision: 0 });
  });
});

describe("pilot readiness", () => {
  const readyRuns = Array.from({ length: 5 }, (_, index) => ({
    pullRequestNumber: index + 1,
    state: "SUCCEEDED",
  }));
  const preciseRule = {
    ruleId: "security.hardcoded-secret",
    ruleVersion: "1.0.0",
    totalFindings: 10,
    confirmedCount: 9,
    falsePositiveCount: 1,
    unverifiedCount: 0,
    precision: 0.9,
  };

  test("allows enforcement only when repository reliability and rule evidence meet targets", () => {
    const result = computePilotReadiness({ runs: readyRuns, rules: [preciseRule] });

    expect(result.status).toBe("READY");
    expect(result.readyForEnforcement).toBe(true);
    expect(result.eligibleRuleIds).toEqual(["security.hardcoded-secret"]);
    expect(result.eligibleRules).toEqual([{
      ruleId: "security.hardcoded-secret",
      ruleVersion: "1.0.0",
    }]);
    expect(result.reliability).toBe(1);
  });

  test("keeps the pilot collecting when distinct PR coverage is too small", () => {
    const result = computePilotReadiness({
      runs: readyRuns.map((run) => ({ ...run, pullRequestNumber: 1 })),
      rules: [preciseRule],
    });

    expect(result.readyForEnforcement).toBe(false);
    expect(result.eligibleRuleIds).toEqual([]);
    expect(result.blockers[0]).toContain("5 distinct pull requests");
  });

  test("treats partial and failed analysis as reliability misses", () => {
    const result = computePilotReadiness({
      runs: [
        ...readyRuns.slice(0, 3),
        { pullRequestNumber: 4, state: "PARTIAL" },
        { pullRequestNumber: 5, state: "FAILED" },
      ],
      rules: [preciseRule],
    });

    expect(result.reliability).toBe(0.6);
    expect(result.readyForEnforcement).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes("95%"))).toBe(true);
  });

  test("requires enough verified findings at the precision target", () => {
    const result = computePilotReadiness({
      runs: readyRuns,
      rules: [{ ...preciseRule, confirmedCount: 8, falsePositiveCount: 1, totalFindings: 9, precision: 8 / 9 }],
    });

    expect(result.readyForEnforcement).toBe(false);
    expect(result.rules[0]?.eligibleForEnforcement).toBe(false);
  });
});
