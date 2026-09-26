import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { repositoryService } from "@/services/repository.service";
import { canManageRepository } from "@/services/repository-authorization.service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canManageRepository(user, id)) return forbiddenResponse("Repository manager access required");
  
  const repository = await repositoryService.getRepositoryOverview(id);
  if (!repository) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  return NextResponse.json(repository);
}
