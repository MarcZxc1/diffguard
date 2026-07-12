import { Router } from "express";
import { getReviewRun, rerunReviewRun } from "../controllers/review-run.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

export const reviewRunRouter = Router();

reviewRunRouter.get(
  "/:id",
  authMiddleware,
  getReviewRun,
);
reviewRunRouter.post("/:id/rerun", authMiddleware, rerunReviewRun);
