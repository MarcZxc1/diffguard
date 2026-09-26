import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { repositoryService } from "@/services/repository.service";
import { canManageRepository } from "@/services/repository-authorization.service";
import { PilotReadinessError } from "@/services/pilot.service";
import { RuleConfigurationError } from "@/services/rule-engine";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canManageRepository(user, id)) return forbiddenResponse("Repository manager access required");
  
  try {
    const body = await request.json();
    const repository = await repositoryService.updateSettings(id, body, user);
    if (!repository) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    return NextResponse.json(repository);
  } catch (error: any) {
    if (error instanceof PilotReadinessError) {
      return NextResponse.json({ error: error.message, blockers: error.blockers }, { status: 409 });
    }
    if (error instanceof RuleConfigurationError || error.message?.includes("settings")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
