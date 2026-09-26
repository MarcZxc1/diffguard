import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { repositoryService } from "@/services/repository.service";
import { canAccessRepository } from "@/services/repository-authorization.service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canAccessRepository(user, id)) return forbiddenResponse("Repository access required");
  
  const metrics = await repositoryService.metrics(id);
  return NextResponse.json(metrics);
}
