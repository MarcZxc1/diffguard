import { z } from "zod";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import type { prisma as prismaClient } from "../lib/prisma";
import type { AuthenticatedUser } from "./repository-authorization.service";
import { recordAuditLog } from "./repository-authorization.service";
import { shouldEnforceRule } from "./pilot-gate.service";
import { deterministicRules } from "./rule-engine";

export const PILOT_THRESHOLDS = Object.freeze({
  minimumReviewedPullRequests: 5,
  minimumReliability: 0.95,
  minimumPrecision: 0.9,
  minimumVerifiedFindings: 10,
});

export class PilotReadinessError extends Error {
  constructor(public readonly blockers: string[]) {
    super("Pilot evidence does not meet the enforcement thresholds");
  }
}

export class PilotVerificationInputError extends Error {}

const verificationInputSchema = z.object({
  verification: z.enum(["CONFIRMED", "FALSE_POSITIVE"]),
  notes: z.string().trim().max(2000).default(""),
}).strict();

export const verifyFinding = {
  parseInput(input: unknown) {
    const parsed = verificationInputSchema.safeParse(input);
    if (!parsed.success) throw new PilotVerificationInputError("Invalid verification input");
    return parsed.data;
  },

  async execute(
    repositoryId: string,
    findingId: string,
    input: unknown,
    user: AuthenticatedUser,
    database: typeof prismaClient = prisma,
  ) {
    const data = this.parseInput(input);
    const finding = await database.finding.findFirst({
      where: {
        id: findingId,
        reviewRun: { repositoryId },
      },
      select: {
        id: true,
        reviewRunId: true,
        reviewRun: { select: { repositoryId: true } },
      },
    });
    if (!finding) return null;

    const updated = await database.finding.update({
      where: { id: findingId },
      data: {
        pilotVerification: data.verification,
        pilotVerifiedAt: new Date(),
        pilotVerifiedBy: user.id,
        pilotNotes: data.notes || null,
      },
      select: {
        id: true,
        pilotVerification: true,
        pilotVerifiedAt: true,
        pilotNotes: true,
      },
    });

    await recordAuditLog({
      user,
      repositoryId: finding.reviewRun.repositoryId,
      action: `finding.pilot.${data.verification.toLowerCase()}`,
      metadata: { findingId, verification: data.verification },
    }, database);

    return updated;
  },
};

export function computeRulePrecision(
  findings: { pilotVerification: string | null }[],
) {
  const confirmed = findings.filter(
    (f) => f.pilotVerification === "CONFIRMED",
  ).length;
  const falsePositive = findings.filter(
    (f) => f.pilotVerification === "FALSE_POSITIVE",
  ).length;
  const unverified = findings.filter(
    (f) => !f.pilotVerification,
  ).length;
  const denominator = confirmed + falsePositive;
  return {
    totalFindings: findings.length,
    confirmedCount: confirmed,
    falsePositiveCount: falsePositive,
    unverifiedCount: unverified,
    precision: denominator === 0 ? 0 : confirmed / denominator,
  };
}

type RulePrecision = ReturnType<typeof computeRulePrecision> & {
  ruleId: string;
  ruleVersion: string;
};

function groupPrecisionByRule(
  findings: { ruleId: string; ruleVersion: string; pilotVerification: string | null }[],
): RulePrecision[] {
  const byRule = new Map<string, {
    ruleId: string;
    ruleVersion: string;
    findings: { pilotVerification: string | null }[];
  }>();
  for (const finding of findings) {
    const key = `${finding.ruleId}\u0000${finding.ruleVersion}`;
    const group = byRule.get(key) ?? {
      ruleId: finding.ruleId,
      ruleVersion: finding.ruleVersion,
      findings: [],
    };
    group.findings.push(finding);
    byRule.set(key, group);
  }

  return Array.from(byRule.values())
    .map((group) => ({
      ruleId: group.ruleId,
      ruleVersion: group.ruleVersion,
      ...computeRulePrecision(group.findings),
    }))
    .sort((left, right) =>
      left.ruleId.localeCompare(right.ruleId) ||
      left.ruleVersion.localeCompare(right.ruleVersion)
    );
}

export async function getPilotPrecisionByRule(
  repositoryId: string,
  database: typeof prismaClient = prisma,
) {
  const findings = await database.finding.findMany({
    where: {
      reviewRun: { repositoryId },
      category: "SECURITY",
      source: "DETERMINISTIC",
      suppressed: false,
    },
    select: { ruleId: true, ruleVersion: true, pilotVerification: true },
  });

  return groupPrecisionByRule(findings);
}

export function computePilotReadiness(params: {
  runs: { pullRequestNumber: number; state: string }[];
  rules: RulePrecision[];
  thresholds?: typeof PILOT_THRESHOLDS;
}) {
  const thresholds = params.thresholds ?? PILOT_THRESHOLDS;
  const completedRuns = params.runs.filter((run) =>
    run.state === "SUCCEEDED" || run.state === "PARTIAL" || run.state === "FAILED"
  );
  const successfulRunCount = completedRuns.filter((run) => run.state === "SUCCEEDED").length;
  const reviewedPullRequestCount = new Set(
    completedRuns.map((run) => run.pullRequestNumber),
  ).size;
  const reliability = completedRuns.length === 0
    ? 0
    : successfulRunCount / completedRuns.length;
  const repositoryEvidenceReady =
    reviewedPullRequestCount >= thresholds.minimumReviewedPullRequests &&
    reliability >= thresholds.minimumReliability;
  const rules = params.rules.map((rule) => {
    const verifiedFindingCount = rule.confirmedCount + rule.falsePositiveCount;
    const evidenceReady = shouldEnforceRule({
      precision: rule.precision,
      minimumPrecision: thresholds.minimumPrecision,
      minimumVerifiedFindings: thresholds.minimumVerifiedFindings,
      totalVerifiedFindings: verifiedFindingCount,
    });
    return {
      ...rule,
      verifiedFindingCount,
      eligibleForEnforcement: repositoryEvidenceReady && evidenceReady,
    };
  });
  const eligibleRuleIds = rules
    .filter((rule) => rule.eligibleForEnforcement)
    .map((rule) => rule.ruleId);
  const eligibleRules = rules
    .filter((rule) => rule.eligibleForEnforcement)
    .map((rule) => ({ ruleId: rule.ruleId, ruleVersion: rule.ruleVersion }));
  const blockers: string[] = [];
  if (reviewedPullRequestCount < thresholds.minimumReviewedPullRequests) {
    blockers.push(
      `Review at least ${thresholds.minimumReviewedPullRequests} distinct pull requests (${reviewedPullRequestCount} recorded).`,
    );
  }
  if (reliability < thresholds.minimumReliability) {
    blockers.push(
      `Reach ${(thresholds.minimumReliability * 100).toFixed(0)}% successful full-coverage runs (${(reliability * 100).toFixed(1)}% recorded).`,
    );
  }
  if (eligibleRuleIds.length === 0) {
    blockers.push(
      `Verify at least ${thresholds.minimumVerifiedFindings} findings for a rule at ${(thresholds.minimumPrecision * 100).toFixed(0)}% precision or better.`,
    );
  }

  return {
    status: blockers.length === 0 ? "READY" as const : "COLLECTING" as const,
    readyForEnforcement: blockers.length === 0,
    thresholds,
    reviewedPullRequestCount,
    completedRunCount: completedRuns.length,
    successfulRunCount,
    partialRunCount: completedRuns.filter((run) => run.state === "PARTIAL").length,
    failedRunCount: completedRuns.filter((run) => run.state === "FAILED").length,
    skippedRunCount: params.runs.filter((run) => run.state === "SKIPPED").length,
    reliability,
    eligibleRuleIds,
    eligibleRules,
    blockers,
    rules,
  };
}

type PilotReadiness = ReturnType<typeof computePilotReadiness>;

export function addEnforcementAvailability(
  pilot: PilotReadiness,
  options: {
    nodeEnv: "development" | "test" | "production";
    developmentBypassEnabled: boolean;
  } = {
    nodeEnv: env.NODE_ENV,
    developmentBypassEnabled: env.DIFFGUARD_DEV_ENFORCEMENT_BYPASS,
  },
) {
  const developmentBypassEnabled =
    options.nodeEnv === "development" && options.developmentBypassEnabled;
  const developmentBypassActive =
    developmentBypassEnabled && !pilot.readyForEnforcement;
  const effectiveEnforceableRules = developmentBypassActive
    ? deterministicRules
      .filter((rule) => rule.category === "SECURITY")
      .map((rule) => ({ ruleId: rule.id, ruleVersion: rule.version }))
    : pilot.eligibleRules;

  return {
    ...pilot,
    canEnableEnforcing: pilot.readyForEnforcement || developmentBypassEnabled,
    effectiveEnforceableRules,
    developmentBypass: {
      enabled: developmentBypassEnabled,
      active: developmentBypassActive,
    },
  };
}

export async function getPilotStatus(
  repositoryId: string,
  database: typeof prismaClient = prisma,
) {
  const [runs, rules] = await Promise.all([
    database.reviewRun.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { pullRequestNumber: true, state: true },
    }),
    getPilotPrecisionByRule(repositoryId, database),
  ]);
  return addEnforcementAvailability(computePilotReadiness({ runs, rules }));
}

export async function snapshotPilotPrecision(repositoryId: string) {
  const metrics = await getPilotPrecisionByRule(repositoryId);
  return await Promise.all(
    metrics.map((m) =>
      prisma.pilotPrecisionSnapshot.create({
        data: {
          repositoryId,
          ruleId: m.ruleId,
          ruleVersion: m.ruleVersion,
          totalFindings: m.totalFindings,
          confirmedCount: m.confirmedCount,
          falsePositiveCount: m.falsePositiveCount,
          unverifiedCount: m.unverifiedCount,
          precision: m.precision,
        },
      })
    ),
  );
}
