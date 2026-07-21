import { Router } from "express";
import {
  getRepository,
  getRepositoryMetrics,
  listRepositories,
  pruneRepositoryRetention,
  updateRepositoryRules,
  updateRepositorySettings,
  verifyFindingController,
  getPilotPrecisionController,
  getPilotStatusController,
  discoverGithubRepositories,
  connectGithubRepository,
  testRepositoryAiReviewController,
} from "../controllers/repository.controller";
import {
  downloadPullRequestEvidence,
  previewPullRequestEvidence,
} from "../controllers/evidence-export.controller";
import { authMiddleware, requireRole } from "../middlewares/auth.middleware";

export const repositoryRouter = Router();

repositoryRouter.get("/github/discover", authMiddleware, discoverGithubRepositories);
repositoryRouter.post("/github/connect", authMiddleware, connectGithubRepository);

repositoryRouter.get("/", authMiddleware, listRepositories);
repositoryRouter.get("/:id", authMiddleware, getRepository);
repositoryRouter.get("/:id/metrics", authMiddleware, getRepositoryMetrics);
repositoryRouter.post("/:id/ai/test", authMiddleware, testRepositoryAiReviewController);
repositoryRouter.patch("/:id/settings", authMiddleware, updateRepositorySettings);
repositoryRouter.post("/:id/retention/prune", authMiddleware, pruneRepositoryRetention);
repositoryRouter.post("/:id/evidence/preview", authMiddleware, previewPullRequestEvidence);
repositoryRouter.post("/:id/evidence/download", authMiddleware, downloadPullRequestEvidence);
repositoryRouter.patch(
  "/:id/rules",
  authMiddleware,
  requireRole(["ADMIN"]),
  updateRepositoryRules,
);
repositoryRouter.patch("/:id/findings/:findingId/verify", authMiddleware, verifyFindingController);
repositoryRouter.get("/:id/pilot/precision", authMiddleware, getPilotPrecisionController);
repositoryRouter.get("/:id/pilot/status", authMiddleware, getPilotStatusController);
