import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { prisma as prismaClient } from "../lib/prisma";
import type { AuthenticatedUser } from "./repository-authorization.service";
import { recordAuditLog } from "./repository-authorization.service";

const verificationInputSchema = z.object({
  verification: z.enum(["CONFIRMED", "FALSE_POSITIVE"]),
  notes: z.string().max(2000).default(""),
}).strict();

export const verifyFinding = {
  parseInput(input: unknown) {
    const parsed = verificationInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid verification input");
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

export async function getPilotPrecisionByRule(repositoryId: string) {
  const findings = await prisma.finding.findMany({
    where: { reviewRun: { repositoryId } },
    select: { ruleId: true, pilotVerification: true },
  });

  const byRule = new Map<string, { pilotVerification: string | null }[]>();
  for (const finding of findings) {
    const list = byRule.get(finding.ruleId) ?? [];
    list.push(finding);
    byRule.set(finding.ruleId, list);
  }

  return Array.from(byRule.entries()).map(([ruleId, ruleFindgs]) => ({
    ruleId,
    ...computeRulePrecision(ruleFindgs),
  }));
}

export async function snapshotPilotPrecision(repositoryId: string) {
  const metrics = await getPilotPrecisionByRule(repositoryId);
  return await Promise.all(
    metrics.map((m) =>
      prisma.pilotPrecisionSnapshot.create({
        data: {
          repositoryId,
          ruleId: m.ruleId,
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
