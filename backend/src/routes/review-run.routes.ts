import { Router } from "express";
import { getReviewRun } from "../controllers/review-run.controller";
import { authMiddleware, requireRole } from "../middlewares/auth.middleware";

export const reviewRunRouter = Router();

reviewRunRouter.get(
  "/:id",
  authMiddleware,
  requireRole(["ADMIN"]),
  getReviewRun,
);
