import type { Response } from "express";
import { z } from "zod";
import { HttpError } from "../middlewares/error.middleware";
import type { AuthRequest } from "../middlewares/auth.middleware";
import {
  canAccessRepository,
  canManageRepository,
} from "../services/repository-authorization.service";
import { repositoryService } from "../services/repository.service";
import { reviewRunService } from "../services/review-run.service";

const reviewRunParamsSchema = z.object({ id: z.string().uuid() }).strict();

export async function getReviewRun(req: AuthRequest, res: Response) {
  const parsed = reviewRunParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid review run ID");
  }
  const reviewRun = await reviewRunService.getById(parsed.data.id);
  if (!reviewRun) {
    throw new HttpError(404, "Review run not found");
  }
  if (!req.user || !await canManageRepository(req.user, reviewRun.repositoryId)) {
    throw new HttpError(404, "Review run not found");
  }
  res.json(reviewRun);
}

export async function rerunReviewRun(req: AuthRequest, res: Response) {
  const parsed = reviewRunParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid review run ID");
  }
  const reviewRun = await reviewRunService.getById(parsed.data.id);
  if (!reviewRun) throw new HttpError(404, "Review run not found");
  if (!req.user || !await canAccessRepository(req.user, reviewRun.repositoryId)) {
    throw new HttpError(404, "Review run not found");
  }
  const result = await repositoryService.rerunReviewRun(parsed.data.id, req.user);
  if (!result) throw new HttpError(404, "Review run not found");
  res.json(result);
}
