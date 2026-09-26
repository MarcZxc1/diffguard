import { env } from "@/lib/env";

export async function GET() {
  return Response.json({
    status: "ok",
    webhookConfigured: env.GITHUB_WEBHOOK_SECRET !== "development-webhook-secret",
    webhookPrefix: env.GITHUB_WEBHOOK_SECRET.slice(0, 4),
    webhookLength: env.GITHUB_WEBHOOK_SECRET.length,
  });
}
