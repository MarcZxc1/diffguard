import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../env";
import { verifyGithubWebhookSignature } from "../lib/github-webhook";
import {
  githubWebhookDeliveryService,
  type DeliveryAcceptance,
  type PullRequestDeliveryInput,
} from "../services/github-webhook-delivery.service";

const actionSchema = z.object({ action: z.string().optional() });
const supportedPullRequestActions = ["opened", "synchronize", "reopened", "ready_for_review"] as const;
const pullRequestPayloadSchema = z.object({
  action: z.enum(supportedPullRequestActions),
  installation: z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  repository: z.object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    name: z.string().min(1),
    full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    owner: z.object({ login: z.string().min(1) }).optional(),
  }),
  pull_request: z.object({
    number: z.number().int().positive(),
    draft: z.boolean().optional(),
    head: z.object({ sha: z.string().min(7).max(100) }),
  }),
});

type WebhookHandlerDependencies = {
  accept(input: PullRequestDeliveryInput): Promise<DeliveryAcceptance>;
};

export const githubWebhookRouter = Router();

export function handleGithubWebhookGet(_req: Request, res: Response) {
  res.status(405).json({
    error: "GitHub webhook endpoint only accepts POST requests",
  });
}

export function createGithubWebhookHandler(
  dependencies: WebhookHandlerDependencies = githubWebhookDeliveryService,
) {
  return async function handleGithubWebhook(req: Request, res: Response) {
    const signature = req.header("x-hub-signature-256");
    const event = req.header("x-github-event");
    const deliveryId = req.header("x-github-delivery");

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: "Expected raw request body" });
    }
    if (!verifyGithubWebhookSignature({
      rawBody: req.body,
      signatureHeader: signature,
      secret: env.GITHUB_WEBHOOK_SECRET,
    })) {
      return res.status(401).json({ error: "Invalid GitHub webhook signature" });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    if (!deliveryId || deliveryId.length > 200) {
      return res.status(400).json({ error: "Missing or invalid GitHub delivery ID" });
    }
    if (event !== "pull_request") {
      return res.status(202).json({ message: "Event ignored", event });
    }

    const action = actionSchema.safeParse(payload);
    if (!action.success) {
      return res.status(400).json({ error: "Incomplete pull request payload" });
    }
    if (!supportedPullRequestActions.includes(action.data.action as typeof supportedPullRequestActions[number])) {
      return res.status(202).json({
        message: "Pull request action ignored",
        action: action.data.action,
      });
    }
    const parsed = pullRequestPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return res.status(400).json({ error: "Incomplete pull request payload" });
    }

    const [repositoryOwner, repositoryName] = parsed.data.repository.full_name.split("/") as [string, string];
    try {
      const acceptance = await dependencies.accept({
        deliveryId,
        eventType: "pull_request",
        installationId: parsed.data.installation.id,
        accountLogin: parsed.data.repository.owner?.login,
        repositoryId: parsed.data.repository.id,
        repositoryOwner,
        repositoryName,
        repositoryFullName: parsed.data.repository.full_name,
        pullRequestNumber: parsed.data.pull_request.number,
        headSha: parsed.data.pull_request.head.sha,
        action: parsed.data.action,
        isDraft: parsed.data.pull_request.draft ?? false,
      });

      if (acceptance.kind === "disabled") {
        return res.status(202).json({ message: "Repository is disabled" });
      }
      if (acceptance.kind === "skipped") {
        return res.status(202).json({
          message: "Review skipped",
          reviewRunId: acceptance.reviewRunId,
          state: acceptance.state,
          reason: acceptance.reason,
        });
      }
      if (acceptance.kind === "duplicate") {
        return res.status(200).json({
          message: "Webhook already registered",
          reviewRunId: acceptance.reviewRunId,
          state: acceptance.state,
        });
      }
      return res.status(202).json({
        message: acceptance.kind === "requeued" ? "Webhook requeued" : "Webhook queued",
        reviewRunId: acceptance.reviewRunId,
        state: acceptance.state,
      });
    } catch {
      console.error("GitHub webhook could not be durably queued.");
      return res.status(503).json({ error: "Unable to queue GitHub review" });
    }
  };
}

export const handleGithubWebhook = createGithubWebhookHandler();

githubWebhookRouter.get("/github", handleGithubWebhookGet);
githubWebhookRouter.post(
  "/github",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleGithubWebhook,
);
