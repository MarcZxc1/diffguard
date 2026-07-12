import { beforeEach, describe, expect, test } from "bun:test";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  hashOAuthExchangeCode,
} from "./oauth-token.service";

describe("OAuth token storage helpers", () => {
  beforeEach(() => {
    process.env.GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY = "test-encryption-key";
  });

  test("encrypts tokens without storing plaintext", () => {
    const token = "github-oauth-token-example";
    const encrypted = encryptOAuthToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptOAuthToken(encrypted)).toBe(token);
  });

  test("hashes exchange codes deterministically", () => {
    expect(hashOAuthExchangeCode("code-1")).toBe(hashOAuthExchangeCode("code-1"));
    expect(hashOAuthExchangeCode("code-1")).not.toBe(hashOAuthExchangeCode("code-2"));
  });
});
