import { NextResponse, after } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";
import { reviewRunService } from "@/services/review-run.service";
import { repositoryService } from "@/services/repository.service";
import { canAccessRepository } from "@/services/repository-authorization.service";
import { processNextReviewRun } from "@/services/review-worker";

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

  after(async () => {
    try {
      await processNextReviewRun();
    } catch (error) {
      console.error("Async rerun execution failed:", error);
    }
  });

  return NextResponse.json(result);
}
