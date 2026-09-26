import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { reviewRunService } from "@/services/review-run.service";
import { canManageRepository } from "@/services/repository-authorization.service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;

  const reviewRun = await reviewRunService.getById(id);
  if (!reviewRun) return NextResponse.json({ error: "Review run not found" }, { status: 404 });
  if (!await canManageRepository(user, reviewRun.repositoryId)) {
    return NextResponse.json({ error: "Review run not found" }, { status: 404 });
  }

  return NextResponse.json(reviewRun);
}
