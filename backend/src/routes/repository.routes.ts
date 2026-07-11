import { Router } from "express";
import { updateRepositoryRules } from "../controllers/repository.controller";
import { authMiddleware, requireRole } from "../middlewares/auth.middleware";

export const repositoryRouter = Router();

repositoryRouter.patch(
  "/:id/rules",
  authMiddleware,
  requireRole(["ADMIN"]),
  updateRepositoryRules,
);
