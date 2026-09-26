import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canConnectRepository } from "@/services/github-permissions.service";
import { 
  connectedGithubCredential, 
  githubHeaders, 
  invalidateGithubOAuthGrant, 
  syncInstalledGithubAppRepository 
} from "../route-helpers";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const { githubRepositoryId } = await request.json();
    if (!githubRepositoryId) return NextResponse.json({ error: "Invalid repository payload" }, { status: 400 });

    let repo = await prisma.githubRepository.findUnique({
      where: { githubRepositoryId },
      select: { id: true, githubRepositoryId: true, fullName: true },
    });

    const credential = await connectedGithubCredential(user.id);
    const repoRes = await fetch(`https://api.github.com/repositories/${githubRepositoryId}`, {
      headers: githubHeaders(credential.accessToken),
    });

    if (repoRes.status === 401) {
      throw new Error("GITHUB_REAUTH_REQUIRED");
    }
    if (repoRes.status === 403 || repoRes.status === 404) {
      return NextResponse.json({ error: "You do not have access to this repository on GitHub" }, { status: 403 });
    }
    if (!repoRes.ok) return NextResponse.json({ error: "Failed to verify repository access with GitHub" }, { status: 502 });
    
    const githubRepo = await repoRes.json();
    if (!canConnectRepository(githubRepo.permissions)) {
      return NextResponse.json({ error: "GitHub admin or maintain permission is required to connect this repository" }, { status: 403 });
    }

    if (!repo) {
      repo = await syncInstalledGithubAppRepository({
        githubRepositoryId: githubRepo.id,
        fullName: githubRepo.full_name,
      });
    }

    if (!repo) return NextResponse.json({ error: "Repository is not installed in DiffGuard via the GitHub App yet." }, { status: 400 });

    await prisma.githubRepositoryAccess.upsert({
      where: { userId_repositoryId: { userId: user.id, repositoryId: repo.id } },
      update: {},
      create: { userId: user.id, repositoryId: repo.id, role: "MANAGER" },
    });

    return NextResponse.json({ success: true, repositoryId: repo.id });
  } catch (error: any) {
    if (error.message === "GITHUB_REAUTH_REQUIRED") {
      return NextResponse.json({ error: "GitHub authorization expired or was revoked. Sign in with GitHub again." }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
