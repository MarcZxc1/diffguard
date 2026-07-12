import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { HttpError } from "../middlewares/error.middleware";
import { evidenceExportService } from "../services/evidence-export.service";
import { canManageRepository } from "../services/repository-authorization.service";

const repositoryParamsSchema = z.object({ id: z.string().uuid() }).strict();

async function requireAccess(req: AuthRequest, repositoryId: string) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  if (!await canManageRepository(req.user, repositoryId)) {
    throw new HttpError(403, "Repository manager access required");
  }
}

export async function previewPullRequestEvidence(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireAccess(req, params.data.id);
  try {
    const preview = await evidenceExportService.preview(params.data.id, req.body, req.user!);
    if (!preview) throw new HttpError(404, "Repository not found");
    res.json(preview);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error) throw new HttpError(400, error.message);
    throw error;
  }
}

export async function downloadPullRequestEvidence(req: AuthRequest, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) throw new HttpError(400, "Invalid repository ID");
  await requireAccess(req, params.data.id);
  try {
    const exported = await evidenceExportService.download(params.data.id, req.body, req.user!);
    if (!exported) throw new HttpError(404, "Repository not found");
    res
      .status(200)
      .setHeader("content-type", "text/markdown; charset=utf-8")
      .setHeader("content-disposition", `attachment; filename="${exported.filename.replace(/"/g, "")}"`)
      .send(exported.markdown);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error) throw new HttpError(400, error.message);
    throw error;
  }
}
