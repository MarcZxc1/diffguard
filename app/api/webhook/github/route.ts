import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { verifyGithubWebhookSignature } from "@/lib/github-webhook";
import { githubWebhookDeliveryService } from "@/services/github-webhook-delivery.service";
import { processNextReviewRun } from "@/services/review-worker";
import { z } from "zod";

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

export async function POST(request: Request) {
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");

  const rawBody = await request.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  if (!verifyGithubWebhookSignature({
    rawBody: bodyBuffer,
    signatureHeader: signature || "",
    secret: env.GITHUB_WEBHOOK_SECRET,
  })) {
    return NextResponse.json({ error: "Invalid GitHub webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!deliveryId || deliveryId.length > 200) {
    return NextResponse.json({ error: "Missing or invalid GitHub delivery ID" }, { status: 400 });
  }
  if (event !== "pull_request") {
    return NextResponse.json({ message: "Event ignored", event }, { status: 202 });
  }

  const action = actionSchema.safeParse(payload);
  if (!action.success) return NextResponse.json({ error: "Incomplete pull request payload" }, { status: 400 });
  
  if (!supportedPullRequestActions.includes(action.data.action as any)) {
    return NextResponse.json({ message: "Pull request action ignored", action: action.data.action }, { status: 202 });
  }

  const parsed = pullRequestPayloadSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Incomplete pull request payload" }, { status: 400 });

  const [repositoryOwner, repositoryName] = parsed.data.repository.full_name.split("/") as [string, string];
  
  try {
    const acceptance = await githubWebhookDeliveryService.accept({
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

    if (acceptance.kind === "disabled") return NextResponse.json({ message: "Repository is disabled" }, { status: 202 });
    if (acceptance.kind === "skipped") return NextResponse.json({ message: "Review skipped", reviewRunId: acceptance.reviewRunId, state: acceptance.state, reason: acceptance.reason }, { status: 202 });
    if (acceptance.kind === "duplicate") return NextResponse.json({ message: "Webhook already registered", reviewRunId: acceptance.reviewRunId, state: acceptance.state }, { status: 200 });
    if (acceptance.kind === "queued" || acceptance.kind === "requeued") {
      after(async () => {
        try {
          let processed = 0;
          while (processed < 5 && await processNextReviewRun()) {
            processed++;
          }
        } catch (error) {
          console.error("Async review execution failed:", error);
        }
      });
    }

    return NextResponse.json({
      message: acceptance.kind === "requeued" ? "Webhook requeued" : "Webhook queued",
      reviewRunId: acceptance.reviewRunId,
      state: acceptance.state,
    }, { status: 202 });
  } catch (err) {
    console.error("GitHub webhook could not be durably queued.", err);
    return NextResponse.json({ error: "Unable to queue GitHub review" }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "GitHub webhook endpoint only accepts POST requests" }, { status: 405 });
}
