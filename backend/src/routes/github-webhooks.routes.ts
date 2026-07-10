import express, { Router } from "express";
import { env } from "../env";
import { verifyGithubWebhookSignature } from "../lib/github-webhook";
import { githubWebhookDeliveryService } from "../services/github-webhook-delivery.service";

export const githubWebhookRouter = Router();

// A browser check uses GET, but GitHub deliveries are POST-only.
githubWebhookRouter.get("/github", (_req, res) => {
  res.status(405).json({
    error: "GitHub webhook endpoint only accepts POST requests",
  });
});

githubWebhookRouter.post(
  "/github",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  async (req, res) => {
    const signature = req.header("x-hub-signature-256");
    const event = req.header("x-github-event");
    const deliveryId = req.header("x-github-delivery");

    // The HMAC must use untouched bytes, not JSON.stringify(parsedPayload).
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        error: "Expected raw request body",
      });
    }

    const isValid = verifyGithubWebhookSignature({
      rawBody: req.body,
      signatureHeader: signature,
      secret: env.GITHUB_WEBHOOK_SECRET,
    });

    if (!isValid) {
      return res.status(401).json({
        error: "Invalid GitHub webhook signature",
      });
    }

    // Verify the sender before parsing or inspecting untrusted JSON.
    let payload: unknown;

    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({
        error: "Invalid JSON payload",
      });
    }

    if (!deliveryId) {
      return res.status(400).json({
        error: "Missing GitHub delivery ID",
      });
    }

    if (event !== "pull_request") {
      return res.status(202).json({
        message: "Event ignored",
        event,
      });
    }

    const prPayload = payload as {
      action?: string;
      pull_request?: {
        number?: number;
        title?: string;
        html_url?: string;
      };
      repository?: {
        full_name?: string;
      };
      installation?: {
        id?: number;
      };
    };

    const allowedActions = ["opened", "synchronize"];

    if (!prPayload.action || !allowedActions.includes(prPayload.action)) {
      return res.status(202).json({
        message: "Pull request action ignored",
        action: prPayload.action,
      });
    }

    const registration = await githubWebhookDeliveryService.register({
      deliveryId,
      eventType: event,
    });

    if (registration.isDuplicate) {
      return res.status(200).json({
        message: "Webhook already processed",
      });
    }

    console.log("GitHub PR webhook received:", {
      deliveryId,
      action: prPayload.action,
      repo: prPayload.repository?.full_name,
      prNumber: prPayload.pull_request?.number,
      prTitle: prPayload.pull_request?.title,
      installationId: prPayload.installation?.id,
    });

    return res.status(200).json({
      message: "Webhook received",
    });
  },
);
