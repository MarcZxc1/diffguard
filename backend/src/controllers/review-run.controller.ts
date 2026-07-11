import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../middlewares/error.middleware";
import { reviewRunService } from "../services/review-run.service";

const reviewRunParamsSchema = z.object({ id: z.string().uuid() }).strict();

export async function getReviewRun(req: Request, res: Response) {
  const parsed = reviewRunParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid review run ID");
  }
  const reviewRun = await reviewRunService.getById(parsed.data.id);
  if (!reviewRun) {
    throw new HttpError(404, "Review run not found");
  }
  res.json(reviewRun);
}
