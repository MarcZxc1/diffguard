import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";
import { reviewRunService } from "@/services/review-run.service";
import { repositoryService } from "@/services/repository.service";
import { canAccessRepository } from "@/services/repository-authorization.service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;

  const reviewRun = await reviewRunService.getById(id);
  if (!reviewRun) return NextResponse.json({ error: "Review run not found" }, { status: 404 });
  if (!await canAccessRepository(user, reviewRun.repositoryId)) {
    return NextResponse.json({ error: "Review run not found" }, { status: 404 });
  }

  const result = await repositoryService.rerunReviewRun(id, user);
  if (!result) return NextResponse.json({ error: "Review run not found" }, { status: 404 });
  return NextResponse.json(result);
}
