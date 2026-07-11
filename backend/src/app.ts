import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { authRouter } from "./routes/auth.routes";
import { githubWebhookRouter } from "./routes/github-webhooks.routes";
import { healthRouter } from "./routes/health.routes";
import { reviewRunRouter } from "./routes/review-run.routes";
import { repositoryRouter } from "./routes/repository.routes";
import { userRouter } from "./routes/user.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));

  // GitHub signs the original bytes, so this router must run before express.json().
  app.use("/api/webhook", githubWebhookRouter);

  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/users", userRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/review-runs", reviewRunRouter);
  app.use("/api/repositories", repositoryRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
