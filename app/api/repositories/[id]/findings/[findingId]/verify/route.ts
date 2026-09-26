import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { canManageRepository } from "@/services/repository-authorization.service";
import { verifyFinding, PilotVerificationInputError } from "@/services/pilot.service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; findingId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id, findingId } = await params;
  if (!await canManageRepository(user, id)) return forbiddenResponse("Repository manager access required");

  try {
    const body = await request.json();
    const result = await verifyFinding.execute(id, findingId, body, user);
    if (!result) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof PilotVerificationInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
