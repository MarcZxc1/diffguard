import crypto from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "v1";

function encryptionSecret() {
  const secret = process.env.GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY or JWT_SECRET is required");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptOAuthToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionSecret(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    version,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptOAuthToken(value: string) {
  const [storedVersion, iv, tag, ciphertext] = value.split(":");
  if (storedVersion !== version || !iv || !tag || !ciphertext) {
    throw new Error("OAuth token ciphertext is invalid");
  }
  const decipher = crypto.createDecipheriv(
    algorithm,
    encryptionSecret(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashOAuthExchangeCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}
