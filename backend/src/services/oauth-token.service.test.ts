import { beforeEach, describe, expect, test } from "bun:test";
import {
  createPkcePair,
  decryptOAuthToken,
  encryptOAuthToken,
  getGithubOAuthAccessToken,
  GithubOAuthUnavailableError,
  GithubReauthenticationRequiredError,
  githubOAuthTokenUpdate,
  hashOAuthExchangeCode,
} from "./oauth-token.service";
import type { prisma as prismaClient } from "../lib/prisma";

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

  test("creates an S256 PKCE verifier and challenge", () => {
    const pkce = createPkcePair();
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.challenge).not.toBe(pkce.verifier);
    expect(pkce.challenge).not.toContain("=");
  });

  test("encrypts refresh tokens and records GitHub expiry durations", () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const update = githubOAuthTokenUpdate({
      access_token: "access-token",
      expires_in: 28_800,
      refresh_token: "refresh-token",
      refresh_token_expires_in: 15_897_600,
    }, now);

    expect(decryptOAuthToken(update.githubAccessTokenCiphertext)).toBe("access-token");
    expect(decryptOAuthToken(update.githubRefreshTokenCiphertext!)).toBe("refresh-token");
    expect(update.githubAccessTokenExpiresAt).toEqual(new Date(now.getTime() + 28_800_000));
    expect(update.githubRefreshTokenExpiresAt).toEqual(new Date(now.getTime() + 15_897_600_000));
    expect(update.githubTokenInvalidatedAt).toBeNull();
  });

  test("returns an unexpired token without refreshing", async () => {
    const ciphertext = encryptOAuthToken("current-token");
    const database = {
      user: {
        async findUnique() {
          return {
            githubAccessTokenCiphertext: ciphertext,
            githubAccessTokenExpiresAt: new Date("2026-07-21T02:00:00.000Z"),
            githubRefreshTokenCiphertext: null,
            githubRefreshTokenExpiresAt: null,
          };
        },
      },
    } as unknown as typeof prismaClient;

    const credential = await getGithubOAuthAccessToken("user-1", database, {
      now: new Date("2026-07-21T00:00:00.000Z"),
      fetchImpl: async () => { throw new Error("refresh should not run"); },
    });

    expect(credential).toEqual({
      accessToken: "current-token",
      accessTokenCiphertext: ciphertext,
    });
  });

  test("refreshes and rotates an expiring GitHub user token", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const accessCiphertext = encryptOAuthToken("old-access");
    const refreshCiphertext = encryptOAuthToken("old-refresh");
    let updateQuery: any;
    const database = {
      user: {
        async findUnique() {
          return {
            githubAccessTokenCiphertext: accessCiphertext,
            githubAccessTokenExpiresAt: new Date(now.getTime() + 30_000),
            githubRefreshTokenCiphertext: refreshCiphertext,
            githubRefreshTokenExpiresAt: new Date(now.getTime() + 600_000),
          };
        },
        async updateMany(query: unknown) {
          updateQuery = query;
          return { count: 1 };
        },
      },
    } as unknown as typeof prismaClient;

    const credential = await getGithubOAuthAccessToken("user-1", database, {
      now,
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (_url, init) => {
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        expect(String(init?.body)).toContain("refresh_token=old-refresh");
        return new Response(JSON.stringify({
          access_token: "new-access",
          expires_in: 28_800,
          refresh_token: "new-refresh",
          refresh_token_expires_in: 15_897_600,
          token_type: "bearer",
        }), { status: 200 });
      },
    });

    expect(credential.accessToken).toBe("new-access");
    expect(decryptOAuthToken(updateQuery.data.githubAccessTokenCiphertext)).toBe("new-access");
    expect(decryptOAuthToken(updateQuery.data.githubRefreshTokenCiphertext)).toBe("new-refresh");
    expect(updateQuery.where).toMatchObject({
      id: "user-1",
      githubAccessTokenCiphertext: accessCiphertext,
      githubRefreshTokenCiphertext: refreshCiphertext,
    });
  });

  test("clears an expired grant and requires reauthentication", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const accessCiphertext = encryptOAuthToken("expired-access");
    let updateQuery: any;
    const database = {
      user: {
        async findUnique() {
          return {
            githubAccessTokenCiphertext: accessCiphertext,
            githubAccessTokenExpiresAt: new Date(now.getTime() - 1),
            githubRefreshTokenCiphertext: encryptOAuthToken("expired-refresh"),
            githubRefreshTokenExpiresAt: new Date(now.getTime() - 1),
          };
        },
        async updateMany(query: unknown) {
          updateQuery = query;
          return { count: 1 };
        },
      },
    } as unknown as typeof prismaClient;

    await expect(getGithubOAuthAccessToken("user-1", database, { now }))
      .rejects.toBeInstanceOf(GithubReauthenticationRequiredError);
    expect(updateQuery.data).toMatchObject({
      githubAccessTokenCiphertext: null,
      githubRefreshTokenCiphertext: null,
      githubTokenInvalidatedAt: now,
    });
  });

  test("keeps encrypted tokens when GitHub refresh is temporarily unavailable", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    let updateCount = 0;
    const database = {
      user: {
        async findUnique() {
          return {
            githubAccessTokenCiphertext: encryptOAuthToken("expired-access"),
            githubAccessTokenExpiresAt: new Date(now.getTime() - 1),
            githubRefreshTokenCiphertext: encryptOAuthToken("valid-refresh"),
            githubRefreshTokenExpiresAt: new Date(now.getTime() + 600_000),
          };
        },
        async updateMany() {
          updateCount += 1;
          return { count: 1 };
        },
      },
    } as unknown as typeof prismaClient;

    await expect(getGithubOAuthAccessToken("user-1", database, {
      now,
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async () => new Response(null, { status: 503 }),
    })).rejects.toBeInstanceOf(GithubOAuthUnavailableError);
    expect(updateCount).toBe(0);
  });

  test("uses a concurrently refreshed token instead of clearing it after a rejected refresh", async () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    const oldAccess = encryptOAuthToken("old-access");
    const newAccess = encryptOAuthToken("new-access");
    const oldRecord = {
      githubAccessTokenCiphertext: oldAccess,
      githubAccessTokenExpiresAt: new Date(now.getTime() - 1),
      githubRefreshTokenCiphertext: encryptOAuthToken("old-refresh"),
      githubRefreshTokenExpiresAt: new Date(now.getTime() + 600_000),
    };
    const newRecord = {
      githubAccessTokenCiphertext: newAccess,
      githubAccessTokenExpiresAt: new Date(now.getTime() + 28_800_000),
      githubRefreshTokenCiphertext: encryptOAuthToken("new-refresh"),
      githubRefreshTokenExpiresAt: new Date(now.getTime() + 15_897_600_000),
    };
    let findCount = 0;
    let updateCount = 0;
    const database = {
      user: {
        async findUnique() {
          findCount += 1;
          return findCount === 1 ? oldRecord : newRecord;
        },
        async updateMany() {
          updateCount += 1;
          return { count: 1 };
        },
      },
    } as unknown as typeof prismaClient;

    const credential = await getGithubOAuthAccessToken("user-1", database, {
      now,
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async () => new Response(null, { status: 400 }),
    });

    expect(credential).toEqual({
      accessToken: "new-access",
      accessTokenCiphertext: newAccess,
    });
    expect(updateCount).toBe(0);
  });
});
