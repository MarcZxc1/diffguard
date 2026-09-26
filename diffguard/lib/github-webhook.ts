import crypto from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function verifyGithubWebhookSignature(params: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
}): boolean {
  const { rawBody, signatureHeader, secret } = params;

  if (!signatureHeader) {
    return false;
  }

  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const receivedSignature = signatureHeader.slice(SIGNATURE_PREFIX.length);

  // GitHub calculates HMAC-SHA256 over the exact request body bytes.
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const receivedBuffer = Buffer.from(receivedSignature, "hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  // timingSafeEqual throws for unequal lengths, so reject malformed hashes first.
  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
