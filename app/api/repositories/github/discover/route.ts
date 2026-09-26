import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { 
  connectedGithubCredential, 
  fetchAccessibleGithubRepositories, 
  syncInstalledGithubAppRepository 
} from "../route-helpers";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const credential = await connectedGithubCredential(user.id);
    const repositories = await fetchAccessibleGithubRepositories(credential);
    const githubRepoIds = repositories.map(r => r.githubRepositoryId);

    const storedRepos = await prisma.githubRepository.findMany({
      where: { githubRepositoryId: { in: githubRepoIds } },
      select: { id: true, githubRepositoryId: true, fullName: true },
    });
    
    const existingRepos = new Map(storedRepos.map(repo => [Number(repo.githubRepositoryId), repo]));

    for (const repo of repositories) {
      if (existingRepos.has(repo.githubRepositoryId)) continue;
      const synced = await syncInstalledGithubAppRepository(repo);
      if (synced) existingRepos.set(Number(synced.githubRepositoryId), synced);
    }

    const existingRepoIds = Array.from(existingRepos.values()).map(r => r.id);
    const userAccesses = await prisma.githubRepositoryAccess.findMany({
      where: { userId: user.id, repositoryId: { in: existingRepoIds } },
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

    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === "GITHUB_REAUTH_REQUIRED") {
      return NextResponse.json(
        {
          error: {
            message: "GitHub authorization expired or was revoked. Reconnect GitHub to discover or connect repositories.",
            details: { code: "GITHUB_REAUTH_REQUIRED" },
          },
        },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
