import express, { Router, type Request, type Response } from "express";
import { env } from "../env";
import {
  createGithubInstallationToken,
  GithubAppError,
  readGithubAppPrivateKey,
} from "../lib/github-app";
import { parseUnifiedDiff } from "../lib/diff-parser";
import { verifyGithubWebhookSignature } from "../lib/github-webhook";
import {
  fetchGithubPullRequestFiles,
  formatRuleFindingComment,
  postGithubReviewComment,
} from "../lib/github-review";
import { githubWebhookDeliveryService } from "../services/github-webhook-delivery.service";
import { scanChangedLines } from "../services/rule-engine";

export const githubWebhookRouter = Router();

// A browser check uses GET, but GitHub deliveries are POST-only.
export function handleGithubWebhookGet(_req: Request, res: Response) {
  res.status(405).json({
    error: "GitHub webhook endpoint only accepts POST requests",
  });
}

export async function handleGithubWebhook(req: Request, res: Response) {
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
        head?: {
          sha?: string;
        };
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

    const installationId = prPayload.installation?.id;

    if (
      typeof installationId !== "number" ||
      !Number.isInteger(installationId) ||
      installationId <= 0
    ) {
      return res.status(400).json({
        error: "Missing or invalid GitHub installation ID",
      });
    }

    if (!env.GITHUB_APP_ID) {
      return res.status(503).json({
        error: "GitHub App credentials are not configured",
      });
    }

    let findingsPosted = 0;

    try {
      const privateKey = readGithubAppPrivateKey({
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        privateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH,
      });

      const installationToken = await createGithubInstallationToken({
        installationId,
        appId: env.GITHUB_APP_ID,
        privateKey,
      });

      const repository = prPayload.repository?.full_name;
      const pullRequestNumber = prPayload.pull_request?.number;
      const commitId = prPayload.pull_request?.head?.sha;

      if (
        !repository ||
        typeof pullRequestNumber !== "number" ||
        !Number.isInteger(pullRequestNumber) ||
        !commitId
      ) {
        return res.status(400).json({
          error: "Incomplete pull request payload",
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

      const files = await fetchGithubPullRequestFiles({
        repository,
        pullRequestNumber,
        token: installationToken.token,
      });
      const changedLines = files.flatMap((file) =>
        file.patch ? parseUnifiedDiff(file.filename, file.patch) : [],
      );
      const findings = scanChangedLines(changedLines).slice(0, 3);

      for (const finding of findings) {
        await postGithubReviewComment({
          repository,
          pullRequestNumber,
          token: installationToken.token,
          commitId,
          filePath: finding.filePath,
          lineNumber: finding.lineNumber,
          body: formatRuleFindingComment(finding),
        });
        findingsPosted += 1;
      }

      console.log("DiffGuard PR review completed:", {
        deliveryId,
        repository,
        pullRequestNumber,
        changedLineCount: changedLines.length,
        findingCount: findings.length,
      });
    } catch (error) {
      if (error instanceof GithubAppError) {
        console.error("GitHub review processing failed:", error.message);
      } else {
        console.error("GitHub review processing failed.");
      }

      return res.status(502).json({
        error: "Unable to process the GitHub review",
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
      findingsPosted,
    });
}

githubWebhookRouter.get("/github", handleGithubWebhookGet);

githubWebhookRouter.post(
  "/github",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  handleGithubWebhook,
);
