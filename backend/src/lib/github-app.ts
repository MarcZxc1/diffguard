import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import { z } from "zod";

const GITHUB_API_VERSION = "2022-11-28";

export type GithubFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const installationTokenSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().min(1),
  permissions: z.record(z.string(), z.string()).optional(),
});

export class GithubAppError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
  }
}

export function readGithubAppPrivateKey(params: {
  privateKey?: string;
  privateKeyPath?: string;
}): string {
  if (params.privateKey) {
    return params.privateKey;
  }

  if (!params.privateKeyPath) {
    throw new GithubAppError("GitHub App private key is not configured");
  }

  try {
    return readFileSync(params.privateKeyPath, "utf8");
  } catch {
    throw new GithubAppError("GitHub App private key file could not be read");
  }
}

export function createGithubAppJwt(params: {
  appId: string;
  privateKey: string;
  nowSeconds?: number;
}): string {
  const appId = params.appId.trim();

  if (!/^\d+$/.test(appId)) {
    throw new GithubAppError("GITHUB_APP_ID must be a numeric GitHub App ID");
  }

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: nowSeconds - 60,
      exp: nowSeconds +  nineMinutesInSeconds,
      iss: appId,
    },
    params.privateKey.replace(/\\n/g, "\n"),
    {
      algorithm: "RS256",
    },
  );
}

const nineMinutesInSeconds = 9 * 60;

export async function createGithubInstallationToken(params: {
  installationId: number;
  appId: string;
  privateKey: string;
  fetchImpl?: GithubFetch;
}): Promise<z.infer<typeof installationTokenSchema>> {
  if (!Number.isInteger(params.installationId) || params.installationId <= 0) {
    throw new GithubAppError("GitHub installation ID must be a positive integer");
  }

  const token = createGithubAppJwt({
    appId: params.appId,
    privateKey: params.privateKey,
  });
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${params.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "DiffGuard",
      },
    },
  );

  if (!response.ok) {
    throw new GithubAppError(
      `GitHub installation token request failed (${response.status})`,
      response.status,
    );
  }

  const parsed = installationTokenSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new GithubAppError("GitHub returned an invalid installation token response");
  }

  return parsed.data;
}
