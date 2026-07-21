import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { prisma as prismaClient } from "../lib/prisma";

const algorithm = "aes-256-gcm";
const version = "v1";
const refreshSkewMilliseconds = 60_000;

export const githubOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
}).passthrough();

export type GithubOAuthTokenResponse = z.infer<typeof githubOAuthTokenResponseSchema>;

export class GithubReauthenticationRequiredError extends Error {
  constructor() {
    super("GitHub authorization expired or was revoked. Sign in with GitHub again.");
  }
}

export class GithubOAuthUnavailableError extends Error {
  constructor() {
    super("GitHub authentication is temporarily unavailable");
  }
}

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

export function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

function expiresAt(now: Date, seconds: number | undefined) {
  return seconds === undefined
    ? null
    : new Date(now.getTime() + seconds * 1000);
}

export function githubOAuthTokenUpdate(
  token: GithubOAuthTokenResponse,
  now = new Date(),
) {
  return {
    githubAccessTokenCiphertext: encryptOAuthToken(token.access_token),
    githubAccessTokenExpiresAt: expiresAt(now, token.expires_in),
    githubRefreshTokenCiphertext: token.refresh_token
      ? encryptOAuthToken(token.refresh_token)
      : null,
    githubRefreshTokenExpiresAt: token.refresh_token
      ? expiresAt(now, token.refresh_token_expires_in)
      : null,
    githubTokenInvalidatedAt: null,
  };
}

type GithubOAuthCredential = {
  accessToken: string;
  accessTokenCiphertext: string;
};

type ResolveOptions = {
  now?: Date;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  clientId?: string;
  clientSecret?: string;
};

const githubOAuthTokenSelect = {
  githubAccessTokenCiphertext: true,
  githubAccessTokenExpiresAt: true,
  githubRefreshTokenCiphertext: true,
  githubRefreshTokenExpiresAt: true,
} as const;

export async function invalidateGithubOAuthGrant(
  userId: string,
  expectedAccessTokenCiphertext: string,
  database: typeof prismaClient = prisma,
  now = new Date(),
) {
  return database.user.updateMany({
    where: {
      id: userId,
      githubAccessTokenCiphertext: expectedAccessTokenCiphertext,
    },
    data: {
      githubAccessTokenCiphertext: null,
      githubAccessTokenExpiresAt: null,
      githubRefreshTokenCiphertext: null,
      githubRefreshTokenExpiresAt: null,
      githubTokenInvalidatedAt: now,
    },
  });
}

async function requireReauthentication(
  userId: string,
  accessTokenCiphertext: string,
  database: typeof prismaClient,
  now: Date,
): Promise<never> {
  await invalidateGithubOAuthGrant(userId, accessTokenCiphertext, database, now);
  throw new GithubReauthenticationRequiredError();
}

async function resolveGithubOAuthAccessToken(
  userId: string,
  database: typeof prismaClient,
  options: ResolveOptions,
  retryAfterRace: boolean,
): Promise<GithubOAuthCredential> {
  const now = options.now ?? new Date();
  const user = await database.user.findUnique({
    where: { id: userId },
    select: githubOAuthTokenSelect,
  });
  if (!user?.githubAccessTokenCiphertext) {
    throw new GithubReauthenticationRequiredError();
  }
  const accessTokenCiphertext = user.githubAccessTokenCiphertext;

  const accessTokenCurrent =
    !user.githubAccessTokenExpiresAt ||
    user.githubAccessTokenExpiresAt.getTime() > now.getTime() + refreshSkewMilliseconds;
  if (accessTokenCurrent) {
    try {
      return {
        accessToken: decryptOAuthToken(accessTokenCiphertext),
        accessTokenCiphertext,
      };
    } catch {
      return requireReauthentication(userId, accessTokenCiphertext, database, now);
    }
  }

  if (
    !user.githubRefreshTokenCiphertext ||
    user.githubRefreshTokenExpiresAt && user.githubRefreshTokenExpiresAt <= now
  ) {
    return requireReauthentication(userId, accessTokenCiphertext, database, now);
  }

  const clientId = options.clientId ?? process.env.GITHUB_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth client credentials are not configured");
  }

  let refreshToken: string;
  try {
    refreshToken = decryptOAuthToken(user.githubRefreshTokenCiphertext);
  } catch {
    return requireReauthentication(userId, accessTokenCiphertext, database, now);
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
  } catch {
    throw new GithubOAuthUnavailableError();
  }

  const reauthenticateUnlessRefreshedByAnotherRequest = async (): Promise<GithubOAuthCredential> => {
    const current = await database.user.findUnique({
      where: { id: userId },
      select: { githubAccessTokenCiphertext: true },
    });
    if (
      retryAfterRace &&
      current?.githubAccessTokenCiphertext &&
      current.githubAccessTokenCiphertext !== accessTokenCiphertext
    ) {
      return resolveGithubOAuthAccessToken(userId, database, options, false);
    }
    return requireReauthentication(userId, accessTokenCiphertext, database, now);
  };

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) {
      throw new GithubOAuthUnavailableError();
    }
    if (response.status === 400) {
      return reauthenticateUnlessRefreshedByAnotherRequest();
    }
    throw new GithubOAuthUnavailableError();
  }

  const token = githubOAuthTokenResponseSchema.safeParse(responseBody);
  if (!token.success) {
    const oauthError = z.object({ error: z.string() }).safeParse(responseBody);
    if (
      oauthError.success &&
      ["bad_refresh_token", "expired_refresh_token", "invalid_grant"].includes(
        oauthError.data.error,
      )
    ) {
      return reauthenticateUnlessRefreshedByAnotherRequest();
    }
    throw new GithubOAuthUnavailableError();
  }
  const update = githubOAuthTokenUpdate(token.data, now);
  const updated = await database.user.updateMany({
    where: {
      id: userId,
      githubAccessTokenCiphertext: accessTokenCiphertext,
      githubRefreshTokenCiphertext: user.githubRefreshTokenCiphertext,
    },
    data: update,
  });
  if (updated.count !== 1) {
    if (retryAfterRace) {
      return resolveGithubOAuthAccessToken(userId, database, options, false);
    }
    throw new GithubOAuthUnavailableError();
  }
  return {
    accessToken: token.data.access_token,
    accessTokenCiphertext: update.githubAccessTokenCiphertext,
  };
}

export function getGithubOAuthAccessToken(
  userId: string,
  database: typeof prismaClient = prisma,
  options: ResolveOptions = {},
) {
  return resolveGithubOAuthAccessToken(userId, database, options, true);
}
