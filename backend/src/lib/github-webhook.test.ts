import crypto from "node:crypto";
import { describe, expect, it } from "bun:test";
import { verifyGithubWebhookSignature } from "./github-webhook";

function sign(rawBody: Buffer, secret: string) {
  return `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
}

describe("verifyGithubWebhookSignature", () => {
  it("accepts a valid GitHub sha256 signature", () => {
    const rawBody = Buffer.from(JSON.stringify({ action: "opened" }));
    const secret = "test-secret";

    expect(
      verifyGithubWebhookSignature({
        rawBody,
        signatureHeader: sign(rawBody, secret),
        secret,
      }),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const rawBody = Buffer.from(JSON.stringify({ action: "opened" }));

    expect(
      verifyGithubWebhookSignature({
        rawBody,
        signatureHeader: sign(Buffer.from("{}"), "test-secret"),
        secret: "test-secret",
      }),
    ).toBe(false);
  });

  it("rejects a missing or malformed signature header", () => {
    const rawBody = Buffer.from("{}");

    expect(
      verifyGithubWebhookSignature({
        rawBody,
        signatureHeader: undefined,
        secret: "test-secret",
      }),
    ).toBe(false);

    expect(
      verifyGithubWebhookSignature({
        rawBody,
        signatureHeader: "sha1=abc",
        secret: "test-secret",
      }),
    ).toBe(false);
  });
});
