import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse, forbiddenResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageRepository, recordAuditLog } from "@/services/repository-authorization.service";
import { consumeAiHealthCheckRateLimit, testOpenAiReviewConfiguration } from "@/services/llm-review.service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  const { id } = await params;
  if (!await canManageRepository(user, id)) return forbiddenResponse("Repository manager access required");

  const repository = await prisma.githubRepository.findUnique({
    where: { id },
    select: { id: true, llmModel: true },
  });
  if (!repository) return NextResponse.json({ error: "Repository not found" }, { status: 404 });

  const retryAfterMilliseconds = consumeAiHealthCheckRateLimit(`${user.id}:${repository.id}`);
  if (retryAfterMilliseconds > 0) {
    return NextResponse.json(
      { error: "AI review health checks are limited to one every 30 seconds", retryAfterSeconds: Math.ceil(retryAfterMilliseconds / 1000) },
      { status: 429 }
    );
  }

  const effectiveModel =
    repository.llmModel && repository.llmModel !== "gpt-5.6-sol"
      ? repository.llmModel
      : process.env.OPENAI_MODEL || "auto:free";
  const result = await testOpenAiReviewConfiguration({ model: effectiveModel });
  await recordAuditLog({
    user,
    repositoryId: id,
    action: "repository.ai_review.tested",
    metadata: { ok: result.ok, status: result.status, model: result.model },
  });
  return NextResponse.json(result);
}
