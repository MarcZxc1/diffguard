import { describe, expect, it } from "bun:test";
import crypto from "node:crypto";
import type { Request, Response } from "express";

process.env.DATABASE_URL ??= "postgresql://diffguard:diffguard@localhost:54519/diffguard";
process.env.JWT_SECRET ??= "phase-zero-test-jwt-secret";
process.env.GITHUB_WEBHOOK_SECRET ??= "phase-zero-test-webhook-secret";

const { createApp } = await import("./app");
const { env } = await import("./env");
const {
  githubWebhookRouter,
  createGithubWebhookHandler,
  handleGithubWebhook,
  handleGithubWebhookGet,
} = await import("./routes/github-webhooks.routes");

function signatureFor(body: Buffer) {
  return `sha256=${crypto
    .createHmac("sha256", env.GITHUB_WEBHOOK_SECRET)
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
  it("serializes Prisma BigInt values as decimal strings at the JSON boundary", () => {
    const app = createApp();
    const replacer = app.get("json replacer") as (
      key: string,
      value: unknown,
    ) => unknown;

    expect(JSON.stringify({ githubId: 9_007_199_254_740_993n }, replacer)).toBe(
      '{"githubId":"9007199254740993"}',
    );
  });

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
      body: { error: "Missing or invalid GitHub delivery ID" },
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

  it("rejects a malformed pull request action instead of treating it as ignored", async () => {
    const output = await invokePost(JSON.stringify({ action: 42 }), {
      "x-github-event": "pull_request",
      "x-github-delivery": "route-test-malformed-action",
    });
    expect(output).toEqual({
      status: 400,
      body: { error: "Incomplete pull request payload" },
    });
  });

  it("durably queues a valid delivery and returns 202 without GitHub API work", async () => {
    let acceptedInput: unknown;
    const handler = createGithubWebhookHandler({
      async accept(input) {
        acceptedInput = input;
        return { kind: "queued", reviewRunId: "run-1", state: "QUEUED" };
      },
    });
    const payload = JSON.stringify({
      action: "opened",
      installation: { id: 123 },
      repository: {
        id: 456,
        name: "diffguard",
        full_name: "MarcZxc1/diffguard",
        owner: { login: "MarcZxc1" },
      },
      pull_request: { number: 7, head: { sha: "abcdef123456" } },
    });
    const request = createRequest(payload, {
      "x-hub-signature-256": signatureFor(Buffer.from(payload)),
      "x-github-event": "pull_request",
      "x-github-delivery": "route-test-queued",
    });
    const { output, response } = createResponse();

    await handler(request, response);

    expect(output).toEqual({
      status: 202,
      body: { message: "Webhook queued", reviewRunId: "run-1", state: "QUEUED" },
    });
    expect(acceptedInput).toMatchObject({
      repositoryFullName: "MarcZxc1/diffguard",
      pullRequestNumber: 7,
      headSha: "abcdef123456",
    });
  });

  it("reports a durable duplicate's actual review state", async () => {
    const handler = createGithubWebhookHandler({
      async accept() {
        return { kind: "duplicate", reviewRunId: "run-1", state: "FAILED" };
      },
    });
    const payload = JSON.stringify({
      action: "synchronize",
      installation: { id: 123 },
      repository: { id: 456, name: "repo", full_name: "owner/repo" },
      pull_request: { number: 7, head: { sha: "abcdef123456" } },
    });
    const request = createRequest(payload, {
      "x-hub-signature-256": signatureFor(Buffer.from(payload)),
      "x-github-event": "pull_request",
      "x-github-delivery": "route-test-duplicate",
    });
    const { output, response } = createResponse();
    await handler(request, response);
    expect(output).toEqual({
      status: 200,
      body: { message: "Webhook already registered", reviewRunId: "run-1", state: "FAILED" },
    });
  });

  it("returns a retryable response when durable enqueueing fails", async () => {
    const handler = createGithubWebhookHandler({
      async accept() {
        throw new Error("database unavailable");
      },
    });
    const payload = JSON.stringify({
      action: "opened",
      installation: { id: 123 },
      repository: { id: 456, name: "repo", full_name: "owner/repo" },
      pull_request: { number: 7, head: { sha: "abcdef123456" } },
    });
    const request = createRequest(payload, {
      "x-hub-signature-256": signatureFor(Buffer.from(payload)),
      "x-github-event": "pull_request",
      "x-github-delivery": "route-test-enqueue-failure",
    });
    const { output, response } = createResponse();
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await handler(request, response);
    } finally {
      console.error = originalError;
    }
    expect(output).toEqual({
      status: 503,
      body: { error: "Unable to queue GitHub review" },
    });
  });
});
