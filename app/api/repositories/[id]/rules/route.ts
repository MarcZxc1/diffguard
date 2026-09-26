import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { repositoryService } from "@/services/repository.service";
import { RuleConfigurationError } from "@/services/rule-engine";
import { recordAuditLog, canManageRepository } from "@/services/repository-authorization.service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  // Based on express controller:
  // if (user.role !== "ADMIN") return forbiddenResponse();
  // Actually, express controller just calls updateRuleConfiguration and assumes route middleware protected it.
  const { id } = await params;
  if (!await canManageRepository(user, id)) return forbiddenResponse("Repository manager access required");
  
  try {
    const body = await request.json();
    const repository = await repositoryService.updateRuleConfiguration(id, body);
    if (!repository) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    await recordAuditLog({
      user,
      repositoryId: id,
      action: "repository.rules.updated",
      metadata: { endpoint: "rules" },
    });
    return NextResponse.json(repository);
  } catch (error: any) {
    if (error instanceof RuleConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
