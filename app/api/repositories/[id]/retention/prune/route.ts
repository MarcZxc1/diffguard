import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { canAccessRepository } from "@/services/repository-authorization.service";
import { repositoryService } from "@/services/repository.service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canAccessRepository(user, id)) return forbiddenResponse("Repository access required");

  const result = await repositoryService.pruneExpiredReviewData(id, user);
  if (!result) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  return NextResponse.json(result);
}
