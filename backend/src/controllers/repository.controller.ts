import type { Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";
import { env } from "../env";
import {
  createGithubAppJwt,
  readGithubAppPrivateKey,
} from "../lib/github-app";
import { HttpError } from "../middlewares/error.middleware";
import { RuleConfigurationError } from "../services/rule-engine";
import {
  getGithubOAuthAccessToken,
  GithubOAuthUnavailableError,
  GithubReauthenticationRequiredError,
  invalidateGithubOAuthGrant,
} from "../services/oauth-token.service";
import {
  canConnectRepository,
  githubPermissionLabel,
} from "../services/github-permissions.service";
import {
  canAccessRepository,
  canManageRepository,
  recordAuditLog,
} from "../services/repository-authorization.service";
import { repositoryService } from "../services/repository.service";
import {
  consumeAiHealthCheckRateLimit,
  testOpenAiReviewConfiguration,
} from "../services/llm-review.service";
import {
  PilotReadinessError,
  PilotVerificationInputError,
} from "../services/pilot.service";
import type { AuthRequest } from "../middlewares/auth.middleware";

const repositoryParamsSchema = z.object({ id: z.string().uuid() }).strict();
const githubPermissionsSchema = z.object({
  admin: z.boolean().optional(),
  maintain: z.boolean().optional(),
  push: z.boolean().optional(),
  triage: z.boolean().optional(),
  pull: z.boolean().optional(),
}).optional();
const githubRepositoryListSchema = z.array(z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
  permissions: githubPermissionsSchema,
}));
const githubRepositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
  permissions: githubPermissionsSchema,
});
const githubRepositoryInstallationSchema = z.object({
  id: z.number().int().positive(),
  account: z.object({
    login: z.string().min(1).optional(),
  }).passthrough().optional(),
});
const connectGithubRepositorySchema = z.object({
  githubRepositoryId: z.number().int().positive(),
}).strict();

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "DiffGuard",
  };
}

type GithubUserCredential = Awaited<ReturnType<typeof getGithubOAuthAccessToken>> & {
  userId: string;
};

function githubReauthenticationError() {
  return new HttpError(
    401,
    "GitHub authorization expired or was revoked. Sign in with GitHub again.",
    { code: "GITHUB_REAUTH_REQUIRED" },
  );
}

async function connectedGithubCredential(userId: string): Promise<GithubUserCredential> {
  try {
    return { userId, ...await getGithubOAuthAccessToken(userId) };
  } catch (error) {
    if (error instanceof GithubReauthenticationRequiredError) {
      throw githubReauthenticationError();
    }
    if (error instanceof GithubOAuthUnavailableError) {
      throw new HttpError(503, error.message);
    }
    throw error;
  }
}

async function assertGithubApiResponse(
  response: globalThis.Response,
  failureMessage: string,
  credential: GithubUserCredential,
) {
  if (response.status === 401) {
    await invalidateGithubOAuthGrant(
      credential.userId,
      credential.accessTokenCiphertext,
    );
    throw githubReauthenticationError();
  }
  if (response.status === 403) {
    throw new HttpError(403, "GitHub denied access to this resource");
  }
  if (!response.ok) {
    throw new HttpError(502, failureMessage);
  }
}

function githubAppHeaders() {
  if (!env.GITHUB_APP_ID) return null;
  const privateKey = readGithubAppPrivateKey({
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
    privateKeyPath: env.GITHUB_APP_PRIVATE_KEY_PATH,
  });
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${createGithubAppJwt({ appId: env.GITHUB_APP_ID, privateKey })}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "DiffGuard",
  };
}

function splitFullName(fullName: string) {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) {
    throw new HttpError(502, "GitHub returned invalid repository identity");
  }
  return { owner, name };
}

async function syncInstalledGithubAppRepository(repo: {
  githubRepositoryId: number;
  fullName: string;
}) {
  const headers = githubAppHeaders();
  if (!headers) return null;

  const { owner, name } = splitFullName(repo.fullName);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}/installation`,
    { headers },
  );

  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(502, "Failed to verify DiffGuard GitHub App installation");
  }
  if (!response.ok) {
    throw new HttpError(502, "Failed to check DiffGuard GitHub App installation");
  }

  const parsed = githubRepositoryInstallationSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new HttpError(502, "GitHub returned invalid installation data");
  }

  const installation = await prisma.githubInstallation.upsert({
    where: { githubInstallationId: BigInt(parsed.data.id) },
    create: {
      githubInstallationId: BigInt(parsed.data.id),
      accountLogin: parsed.data.account?.login,
    },
    update: {
      accountLogin: parsed.data.account?.login,
    },
  });

  return prisma.githubRepository.upsert({
    where: { githubRepositoryId: BigInt(repo.githubRepositoryId) },
    create: {
      githubRepositoryId: BigInt(repo.githubRepositoryId),
      installationId: installation.id,
      owner,
      name,
      fullName: repo.fullName,
    },
    update: {
      installationId: installation.id,
      owner,
      name,
      fullName: repo.fullName,
    },
    select: { id: true, githubRepositoryId: true, fullName: true },
  });
}

async function fetchAccessibleGithubRepositories(credential: GithubUserCredential) {
  const repositories: Array<{
    githubRepositoryId: number;
    fullName: string;
    canConnect: boolean;
    permission: string;
  }> = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const reposRes = await fetch(url, {
      headers: githubHeaders(credential.accessToken),
    });

    await assertGithubApiResponse(
      reposRes,
      "Failed to fetch GitHub repositories",
      credential,
    );
    const reposData = githubRepositoryListSchema.safeParse(await reposRes.json());
    if (!reposData.success) {
      throw new HttpError(502, "GitHub returned invalid repository data");
    }
    for (const repo of reposData.data) {
      repositories.push({
        githubRepositoryId: repo.id,
        fullName: repo.full_name,
        canConnect: canConnectRepository(repo.permissions),
        permission: githubPermissionLabel(repo.permissions),
      });
    }
    if (reposData.data.length < 100) break;
  }

  return repositories;
}

export async function updateRepositoryRules(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) {
    throw new HttpError(400, "Invalid repository ID");
  }
  try {
    const repository = await repositoryService.updateRuleConfiguration(
      params.data.id,
      req.body,
    );
    if (!repository) {
      throw new HttpError(404, "Repository not found");
    }
    await recordAuditLog({
      user: req.user,
      repositoryId: params.data.id,
      action: "repository.rules.updated",
      metadata: { endpoint: "rules" },
    });
    res.json(repository);
  } catch (error) {
    if (error instanceof RuleConfigurationError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}

async function requireRepositoryAccess(req: AuthRequest, repositoryId: string) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (!await canAccessRepository(req.user, repositoryId)) {
    throw new HttpError(404, "Repository not found");
  }
}

async function requireRepositoryManager(req: AuthRequest, repositoryId: string) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (!await canManageRepository(req.user, repositoryId)) {
    throw new HttpError(403, "Repository manager access required");
  }
}

export async function listRepositories(req: AuthRequest, res: Response) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  res.json(await repositoryService.listForUser(req.user));
}

export async function getRepository(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryManager(req, params.data.id);
  const repository = await repositoryService.getRepositoryOverview(params.data.id);
  if (!repository) throw new HttpError(404, "Repository not found");
  res.json(repository);
}

export async function updateRepositorySettings(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryManager(req, params.data.id);
  try {
    const repository = await repositoryService.updateSettings(params.data.id, req.body, req.user!);
    if (!repository) throw new HttpError(404, "Repository not found");
    res.json(repository);
  } catch (error) {
    if (error instanceof PilotReadinessError) {
      throw new HttpError(409, error.message, { blockers: error.blockers });
    }
    if (error instanceof RuleConfigurationError || error instanceof Error && error.message.includes("settings")) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}

export async function testRepositoryAiReviewController(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryManager(req, params.data.id);

  const repository = await prisma.githubRepository.findUnique({
    where: { id: params.data.id },
    select: { id: true, llmModel: true },
  });
  if (!repository) throw new HttpError(404, "Repository not found");

  const retryAfterMilliseconds = consumeAiHealthCheckRateLimit(
    `${req.user!.id}:${repository.id}`,
  );
  if (retryAfterMilliseconds > 0) {
    throw new HttpError(429, "AI review health checks are limited to one every 30 seconds", {
      retryAfterSeconds: Math.ceil(retryAfterMilliseconds / 1_000),
    });
  }

  const result = await testOpenAiReviewConfiguration({
    model: repository.llmModel,
  });
  await recordAuditLog({
    user: req.user,
    repositoryId: params.data.id,
    action: "repository.ai_review.tested",
    metadata: {
      ok: result.ok,
      status: result.status,
      model: result.model,
    },
  });
  res.json(result);
}

export async function getRepositoryMetrics(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  res.json(await repositoryService.metrics(params.data.id));
}

export async function pruneRepositoryRetention(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  const result = await repositoryService.pruneExpiredReviewData(params.data.id, req.user!);
  if (!result) throw new HttpError(404, "Repository not found");
  res.json(result);
}

export async function verifyFindingController(req: AuthRequest, res: Response) {
  const params = z.object({
    id: z.string().uuid(),
    findingId: z.string().uuid(),
  }).safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid IDs");
  await requireRepositoryManager(req, params.data.id);
  const { verifyFinding } = await import("../services/pilot.service");
  let result;
  try {
    result = await verifyFinding.execute(
      params.data.id,
      params.data.findingId,
      req.body,
      req.user!,
    );
  } catch (error) {
    if (error instanceof PilotVerificationInputError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
  if (!result) throw new HttpError(404, "Finding not found");
  res.json(result);
}

export async function getPilotPrecisionController(
  req: AuthRequest,
  res: Response,
) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  const { getPilotPrecisionByRule } = await import(
    "../services/pilot.service"
  );
  res.json(await getPilotPrecisionByRule(params.data.id));
}

export async function getPilotStatusController(
  req: AuthRequest,
  res: Response,
) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireRepositoryAccess(req, params.data.id);
  const { getPilotStatus } = await import("../services/pilot.service");
  res.json(await getPilotStatus(params.data.id));
}

export async function discoverGithubRepositories(req: AuthRequest, res: Response) {
  if (!req.user) throw new HttpError(401, "Authentication required");

  const credential = await connectedGithubCredential(req.user.id);
  const repositories = await fetchAccessibleGithubRepositories(credential);

  const githubRepoIds = repositories.map(r => r.githubRepositoryId);

  const storedRepos = await prisma.githubRepository.findMany({
    where: { githubRepositoryId: { in: githubRepoIds } },
    select: { id: true, githubRepositoryId: true, fullName: true },
  });
  const existingRepos = new Map(
    storedRepos.map((repo) => [Number(repo.githubRepositoryId), repo]),
  );

  for (const repo of repositories) {
    if (existingRepos.has(repo.githubRepositoryId)) continue;
    const synced = await syncInstalledGithubAppRepository(repo);
    if (synced) existingRepos.set(Number(synced.githubRepositoryId), synced);
  }

  const existingRepoIds = Array.from(existingRepos.values()).map(r => r.id);
  const userAccesses = await prisma.githubRepositoryAccess.findMany({
    where: { userId: req.user.id, repositoryId: { in: existingRepoIds } },
  });
  const userAccessRepoIds = new Set(userAccesses.map(a => a.repositoryId));

  const result = repositories.map(repo => {
    const existing = existingRepos.get(repo.githubRepositoryId);
    return {
      githubRepositoryId: repo.githubRepositoryId,
      fullName: repo.fullName,
      canConnect: repo.canConnect,
      permission: repo.permission,
      diffguardRepositoryId: existing?.id,
      isConnected: existing ? userAccessRepoIds.has(existing.id) : false,
      isInstalledInDiffguard: !!existing,
    };
  });

  res.json(result);
}

export async function connectGithubRepository(req: AuthRequest, res: Response) {
  if (!req.user) throw new HttpError(401, "Authentication required");

  const parsed = connectGithubRepositorySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Invalid repository payload");

  let repo = await prisma.githubRepository.findUnique({
    where: { githubRepositoryId: parsed.data.githubRepositoryId },
    select: { id: true, githubRepositoryId: true, fullName: true },
  });

  const credential = await connectedGithubCredential(req.user.id);

  const repoRes = await fetch(`https://api.github.com/repositories/${parsed.data.githubRepositoryId}`, {
    headers: githubHeaders(credential.accessToken),
  });

  if (repoRes.status === 401) {
    await invalidateGithubOAuthGrant(
      credential.userId,
      credential.accessTokenCiphertext,
    );
    throw githubReauthenticationError();
  }
  if (repoRes.status === 403 || repoRes.status === 404) {
    throw new HttpError(403, "You do not have access to this repository on GitHub");
  }
  if (!repoRes.ok) {
    throw new HttpError(502, "Failed to verify repository access with GitHub");
  }
  const githubRepo = githubRepositorySchema.safeParse(await repoRes.json());
  if (!githubRepo.success) {
    throw new HttpError(502, "GitHub returned invalid repository data");
  }
  if (!canConnectRepository(githubRepo.data.permissions)) {
    throw new HttpError(403, "GitHub admin or maintain permission is required to connect this repository");
  }

  if (!repo) {
    repo = await syncInstalledGithubAppRepository({
      githubRepositoryId: githubRepo.data.id,
      fullName: githubRepo.data.full_name,
    });
  }

  if (!repo) {
    throw new HttpError(400, "Repository is not installed in DiffGuard via the GitHub App yet.");
  }

  await prisma.githubRepositoryAccess.upsert({
    where: {
      userId_repositoryId: {
        userId: req.user.id,
        repositoryId: repo.id,
      },
    },
    update: {},
    create: {
      userId: req.user.id,
      repositoryId: repo.id,
      role: "MANAGER",
    },
  });

  res.json({ success: true, repositoryId: repo.id });
}
