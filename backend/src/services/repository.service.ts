import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "./repository-authorization.service";
import { recordAuditLog } from "./repository-authorization.service";
import {
  parseRuleConfiguration,
  type RepositoryRuleConfiguration,
} from "./rule-engine";
import { getPilotStatus, PilotReadinessError } from "./pilot.service";

const repositorySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  draftPullRequestPolicy: z.enum(["SKIP", "ANALYZE"]).optional(),
  checkRunMode: z.enum(["ADVISORY", "ENFORCING"]).optional(),
  llmReviewEnabled: z.boolean().optional(),
  llmModel: z.string().min(1).max(100).optional(),
  retentionDays: z.number().int().min(7).max(365).optional(),
  ruleConfiguration: z.unknown().optional(),
}).strict();

export const repositoryService = {
  async listForUser(user: AuthenticatedUser) {
    const where = user.role === "ADMIN"
      ? {}
      : { accessGrants: { some: { userId: user.id } } };
    return await prisma.githubRepository.findMany({
      where,
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        enabled: true,
        draftPullRequestPolicy: true,
        checkRunMode: true,
        llmReviewEnabled: true,
        llmModel: true,
        retentionDays: true,
        updatedAt: true,
        _count: { select: { reviewRuns: true } },
      },
    });
  },

  async getRepositoryOverview(id: string) {
    return await prisma.githubRepository.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        enabled: true,
        draftPullRequestPolicy: true,
        checkRunMode: true,
        llmReviewEnabled: true,
        llmModel: true,
        retentionDays: true,
        ruleConfiguration: true,
        reviewRuns: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            pullRequestNumber: true,
            headSha: true,
            state: true,
            attemptCount: true,
            checkRunConclusion: true,
            checkRunUrl: true,
            llmState: true,
            llmFailureMessage: true,
            analyzedFileCount: true,
            skippedFileCount: true,
            findingCount: true,
            suppressedFindingCount: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });
  },

  async updateRuleConfiguration(id: string, input: unknown) {
    const configuration = parseRuleConfiguration(input);
    const repository = await prisma.githubRepository.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!repository) return null;
    return await prisma.githubRepository.update({
      where: { id },
      data: {
        ruleConfiguration: configuration as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, fullName: true, ruleConfiguration: true, updatedAt: true },
    });
  },

  async updateSettings(id: string, input: unknown, user: AuthenticatedUser) {
    const parsed = repositorySettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Repository settings are invalid");
    }
    const repository = await prisma.githubRepository.findUnique({
      where: { id },
      select: { id: true, checkRunMode: true },
    });
    if (!repository) return null;
    if (
      parsed.data.checkRunMode === "ENFORCING" &&
      repository.checkRunMode !== "ENFORCING"
    ) {
      const pilot = await getPilotStatus(id);
      if (!pilot.readyForEnforcement) {
        throw new PilotReadinessError(pilot.blockers);
      }
    }
    const data: Prisma.GithubRepositoryUpdateInput = {};
    if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
    if (parsed.data.draftPullRequestPolicy !== undefined) {
      data.draftPullRequestPolicy = parsed.data.draftPullRequestPolicy;
    }
    if (parsed.data.checkRunMode !== undefined) data.checkRunMode = parsed.data.checkRunMode;
    if (parsed.data.llmReviewEnabled !== undefined) data.llmReviewEnabled = parsed.data.llmReviewEnabled;
    if (parsed.data.llmModel !== undefined) data.llmModel = parsed.data.llmModel;
    if (parsed.data.retentionDays !== undefined) data.retentionDays = parsed.data.retentionDays;
    if (parsed.data.ruleConfiguration !== undefined) {
      data.ruleConfiguration = parseRuleConfiguration(parsed.data.ruleConfiguration) as unknown as Prisma.InputJsonValue;
    }
    const updated = await prisma.githubRepository.update({
      where: { id },
      data,
      select: {
        id: true,
        fullName: true,
        enabled: true,
        draftPullRequestPolicy: true,
        checkRunMode: true,
        llmReviewEnabled: true,
        llmModel: true,
        retentionDays: true,
        ruleConfiguration: true,
        updatedAt: true,
      },
    });
    await recordAuditLog({
      user,
      repositoryId: id,
      action: "repository.settings.updated",
      metadata: Object.keys(data),
    });
    return updated;
  },

  async metrics(id: string) {
    const runs = await prisma.reviewRun.findMany({
      where: { repositoryId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        state: true,
        attemptCount: true,
        failureCategory: true,
        startedAt: true,
        completedAt: true,
        skippedFileCount: true,
        findingCount: true,
        suppressedFindingCount: true,
      },
    });
    const processingTimes = runs.flatMap((run) =>
      run.startedAt && run.completedAt ? [run.completedAt.getTime() - run.startedAt.getTime()] : []
    );
    const averageProcessingMilliseconds = processingTimes.length === 0
      ? null
      : Math.round(processingTimes.reduce((sum, value) => sum + value, 0) / processingTimes.length);
    return {
      totalRuns: runs.length,
      byState: runs.reduce<Record<string, number>>((counts, run) => {
        counts[run.state] = (counts[run.state] ?? 0) + 1;
        return counts;
      }, {}),
      retryRate: runs.length === 0
        ? 0
        : runs.filter((run) => run.attemptCount > 1).length / runs.length,
      githubFailureCount: runs.filter((run) =>
        ["AUTHORIZATION", "RATE_LIMIT", "NOT_FOUND", "UPSTREAM", "STALE_COMMIT"].includes(run.failureCategory ?? "")
      ).length,
      averageProcessingMilliseconds,
      suppressionRate: runs.reduce((sum, run) => sum + run.findingCount, 0) === 0
        ? 0
        : runs.reduce((sum, run) => sum + run.suppressedFindingCount, 0) /
          runs.reduce((sum, run) => sum + run.findingCount, 0),
      skippedFileCount: runs.reduce((sum, run) => sum + run.skippedFileCount, 0),
    };
  },

  async rerunReviewRun(id: string, user: AuthenticatedUser) {
    const run = await prisma.reviewRun.findUnique({
      where: { id },
      select: { id: true, repositoryId: true, state: true },
    });
    if (!run) return null;
    await prisma.$transaction(async (transaction) => {
      await transaction.finding.deleteMany({ where: { reviewRunId: id } });
      await transaction.reviewRun.update({
        where: { id },
        data: {
          state: "QUEUED",
          retryable: true,
          attemptCount: 0,
          nextAttemptAt: new Date(),
          failureCategory: null,
          failureMessage: null,
          completedAt: null,
          startedAt: null,
          checkRunId: null,
          checkRunUrl: null,
          checkRunStatus: null,
          checkRunConclusion: null,
          reviewSummary: null,
          analyzedFileCount: 0,
          skippedFileCount: 0,
          findingCount: 0,
          suppressedFindingCount: 0,
          llmState: "SKIPPED",
          llmFailureMessage: null,
          rerunReason: "manual",
          rerunRequestedByUserId: user.id,
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          repositoryId: run.repositoryId,
          action: "review_run.rerun",
          metadata: { reviewRunId: id, previousState: run.state },
        },
      });
    });
    return { id, state: "QUEUED" as const };
  },

  async pruneExpiredReviewData(id: string, user: AuthenticatedUser) {
    const repository = await prisma.githubRepository.findUnique({
      where: { id },
      select: { retentionDays: true },
    });
    if (!repository) return null;
    const cutoff = new Date(Date.now() - repository.retentionDays * 24 * 60 * 60 * 1000);
    const deleted = await prisma.reviewRun.deleteMany({
      where: { repositoryId: id, createdAt: { lt: cutoff } },
    });
    await recordAuditLog({
      user,
      repositoryId: id,
      action: "repository.retention.pruned",
      metadata: { deletedReviewRuns: deleted.count, cutoff },
    });
    return { deletedReviewRuns: deleted.count, cutoff };
  },
};

export type { RepositoryRuleConfiguration };
