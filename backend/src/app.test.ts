import { describe, expect, it } from "bun:test";
import crypto from "node:crypto";
import type { Request, Response } from "express";

process.env.DATABASE_URL ??= "postgresql://diffguard:diffguard@localhost:54519/diffguard";
process.env.JWT_SECRET ??= "phase-zero-test-jwt-secret";
process.env.GITHUB_WEBHOOK_SECRET = "phase-zero-test-webhook-secret";

const { createApp } = await import("./app");
const {
  githubWebhookRouter,
  handleGithubWebhook,
  handleGithubWebhookGet,
} = await import("./routes/github-webhooks.routes");

function signatureFor(body: Buffer) {
  return `sha256=${crypto
    .createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex")}`;
}

function createRequest(body: string, headers: Record<string, string> = {}) {
  const rawBody = Buffer.from(body);
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );

  return {
    body: rawBody,
    header(name: string) {
      return normalizedHeaders[name.toLowerCase()];
    },
  } as Request;
}

function createResponse() {
  const output: { status?: number; body?: unknown } = {};
  const response = {
    status(status: number) {
      output.status = status;
      return response;
    },
    json(body: unknown) {
      output.body = body;
      return response;
    },
  } as unknown as Response;

  return { output, response };
}

async function invokePost(body: string, headers: Record<string, string> = {}) {
  const rawBody = Buffer.from(body);
  const request = createRequest(body, {
    "x-hub-signature-256": signatureFor(rawBody),
    ...headers,
  });
  const { output, response } = createResponse();

  await handleGithubWebhook(request, response);
  return output;
}

describe("GitHub webhook route", () => {
  it("mounts the raw-body webhook router before the global JSON parser", () => {
    const app = createApp() as unknown as {
      router: { stack: Array<{ name: string }> };
    };
    const middlewareNames = app.router.stack.map((layer) => layer.name);
    const webhookRouterIndex = middlewareNames.indexOf("router");
    const jsonParserIndex = middlewareNames.indexOf("jsonParser");

    expect(webhookRouterIndex).toBeGreaterThan(-1);
    expect(jsonParserIndex).toBeGreaterThan(webhookRouterIndex);

    const postLayer = (githubWebhookRouter as unknown as {
      stack: Array<{
        route?: {
          methods: Record<string, boolean>;
          stack: Array<{ name: string }>;
        };
      }>;
    }).stack.find((layer) => layer.route?.methods.post);

    expect(postLayer?.route?.stack.map((layer) => layer.name)).toEqual([
      "rawParser",
      "handleGithubWebhook",
    ]);
  });

  it("returns 405 for browser-style GET requests", () => {
    const { output, response } = createResponse();

    handleGithubWebhookGet({} as Request, response);

    expect(output.status).toBe(405);
  });

  it("verifies a signed raw body before inspecting the event", async () => {
    const output = await invokePost(JSON.stringify({ action: "opened" }), {
      "x-github-event": "push",
      "x-github-delivery": "route-test-raw-body",
    });

    expect(output).toEqual({
      status: 202,
      body: { message: "Event ignored", event: "push" },
    });
  });

  it("rejects an invalid signature before inspecting the event", async () => {
    const output = await invokePost(
      JSON.stringify({ action: "opened" }),
      {
        "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
        "x-github-event": "push",
        "x-github-delivery": "route-test-invalid-signature",
      },
    );

    expect(output.status).toBe(401);
  });

  it("rejects malformed JSON after verifying its exact bytes", async () => {
    const output = await invokePost("{not-json", {
      "x-github-event": "pull_request",
      "x-github-delivery": "route-test-invalid-json",
    });

    expect(output).toEqual({
      status: 400,
      body: { error: "Invalid JSON payload" },
    });
  });

  it("requires a delivery ID before filtering an otherwise valid event", async () => {
    const output = await invokePost(JSON.stringify({ action: "opened" }), {
      "x-github-event": "push",
    });

    expect(output).toEqual({
      status: 400,
      body: { error: "Missing GitHub delivery ID" },
    });
  });

  it("acknowledges unsupported pull request actions without GitHub API work", async () => {
    const output = await invokePost(JSON.stringify({ action: "closed" }), {
      "x-github-event": "pull_request",
      "x-github-delivery": "route-test-ignored-action",
    });

    expect(output).toEqual({
      status: 202,
      body: { message: "Pull request action ignored", action: "closed" },
    });
  });
});
