import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createGithubAppJwt, readGithubAppPrivateKey } from "@/lib/github-app";
import { 
  getGithubOAuthAccessToken, 
  GithubOAuthUnavailableError, 
  GithubReauthenticationRequiredError, 
  invalidateGithubOAuthGrant,
} from "@/services/oauth-token.service";
export { invalidateGithubOAuthGrant };
import { canConnectRepository, githubPermissionLabel } from "@/services/github-permissions.service";

export function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "DiffGuard",
  };
}

export type GithubUserCredential = Awaited<ReturnType<typeof getGithubOAuthAccessToken>> & {
  userId: string;
};

export async function connectedGithubCredential(userId: string): Promise<GithubUserCredential> {
  try {
    return { userId, ...(await getGithubOAuthAccessToken(userId)) };
  } catch (error) {
    if (error instanceof GithubReauthenticationRequiredError) {
      throw new Error("GITHUB_REAUTH_REQUIRED");
    }
    throw error;
  }
}

export async function assertGithubApiResponse(
  response: Response,
  failureMessage: string,
  credential: GithubUserCredential,
) {
  if (response.status === 401) {
    await invalidateGithubOAuthGrant(credential.userId, credential.accessTokenCiphertext);
    throw new Error("GITHUB_REAUTH_REQUIRED");
  }
  if (response.status === 403) throw new Error("GitHub denied access to this resource");
  if (!response.ok) throw new Error(failureMessage);
}

export function githubAppHeaders() {
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

export function splitFullName(fullName: string) {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) throw new Error("GitHub returned invalid repository identity");
  return { owner, name };
}

export async function syncInstalledGithubAppRepository(repo: { githubRepositoryId: number; fullName: string; }) {
  const headers = githubAppHeaders();
  if (!headers) return null;

  const { owner, name } = splitFullName(repo.fullName);
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}/installation`, { headers });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Failed to verify DiffGuard GitHub App installation");

  const parsed = await response.json();
  const installation = await prisma.githubInstallation.upsert({
    where: { githubInstallationId: BigInt(parsed.id) },
    create: { githubInstallationId: BigInt(parsed.id), accountLogin: parsed.account?.login },
    update: { accountLogin: parsed.account?.login },
  });

  return prisma.githubRepository.upsert({
    where: { githubRepositoryId: BigInt(repo.githubRepositoryId) },
    create: { githubRepositoryId: BigInt(repo.githubRepositoryId), installationId: installation.id, owner, name, fullName: repo.fullName },
    update: { installationId: installation.id, owner, name, fullName: repo.fullName },
    select: { id: true, githubRepositoryId: true, fullName: true },
  });
}

export async function fetchAccessibleGithubRepositories(credential: GithubUserCredential) {
  const repositories: Array<{ githubRepositoryId: number; fullName: string; canConnect: boolean; permission: string; }> = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const reposRes = await fetch(url, { headers: githubHeaders(credential.accessToken) });
    await assertGithubApiResponse(reposRes, "Failed to fetch GitHub repositories", credential);
    
    const reposData = await reposRes.json();
    for (const repo of reposData) {
      repositories.push({
        githubRepositoryId: repo.id,
        fullName: repo.full_name,
        canConnect: canConnectRepository(repo.permissions),
        permission: githubPermissionLabel(repo.permissions),
      });
    }
    if (reposData.length < 100) break;
  }
  return repositories;
}
