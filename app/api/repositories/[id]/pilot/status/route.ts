import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { canAccessRepository } from "@/services/repository-authorization.service";
import { getPilotStatus } from "@/services/pilot.service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canAccessRepository(user, id)) return forbiddenResponse("Repository access required");

  const status = await getPilotStatus(id);
  return NextResponse.json(status);
}
