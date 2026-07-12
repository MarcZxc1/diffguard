import type { Response } from "express";
import { z } from "zod";
import { HttpError } from "../middlewares/error.middleware";
import { RuleConfigurationError } from "../services/rule-engine";
import {
  canAccessRepository,
  canManageRepository,
  recordAuditLog,
} from "../services/repository-authorization.service";
import { repositoryService } from "../services/repository.service";
import type { AuthRequest } from "../middlewares/auth.middleware";

const repositoryParamsSchema = z.object({ id: z.string().uuid() }).strict();

export async function updateRepositoryRules(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) {
    throw new HttpError(400, "Invalid repository ID");
  }
  try {
    const repository = await repositoryService.updateRuleConfiguration(
      params.data.id,
      req.body,
    );
    if (!repository) {
      throw new HttpError(404, "Repository not found");
    }
    await recordAuditLog({
      user: req.user,
      repositoryId: params.data.id,
      action: "repository.rules.updated",
      metadata: { endpoint: "rules" },
    });
    res.json(repository);
  } catch (error) {
    if (error instanceof RuleConfigurationError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}

async function requireRepositoryAccess(req: AuthRequest, repositoryId: string) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (!await canAccessRepository(req.user, repositoryId)) {
    throw new HttpError(404, "Repository not found");
  }
}

async function requireRepositoryManager(req: AuthRequest, repositoryId: string) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (!await canManageRepository(req.user, repositoryId)) {
    throw new HttpError(403, "Repository manager access required");
  }
}

export async function listRepositories(req: AuthRequest, res: Response) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  res.json(await repositoryService.listForUser(req.user));
}

export async function getRepository(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryManager(req, params.data.id);
  const repository = await repositoryService.getRepositoryOverview(params.data.id);
  if (!repository) throw new HttpError(404, "Repository not found");
  res.json(repository);
}

export async function updateRepositorySettings(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryManager(req, params.data.id);
  try {
    const repository = await repositoryService.updateSettings(params.data.id, req.body, req.user!);
    if (!repository) throw new HttpError(404, "Repository not found");
    res.json(repository);
  } catch (error) {
    if (error instanceof RuleConfigurationError || error instanceof Error && error.message.includes("settings")) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}

export async function getRepositoryMetrics(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  res.json(await repositoryService.metrics(params.data.id));
}

export async function pruneRepositoryRetention(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  const result = await repositoryService.pruneExpiredReviewData(params.data.id, req.user!);
  if (!result) throw new HttpError(404, "Repository not found");
  res.json(result);
}
