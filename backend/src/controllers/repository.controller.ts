import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../middlewares/error.middleware";
import { RuleConfigurationError } from "../services/rule-engine";
import { repositoryService } from "../services/repository.service";

const repositoryParamsSchema = z.object({ id: z.string().uuid() }).strict();

export async function updateRepositoryRules(req: Request, res: Response) {
  const params = repositoryParamsSchema.safeParse(req.params);
  if (!params.success) {
    throw new HttpError(400, "Invalid repository ID");
  }
  try {
    const repository = await repositoryService.updateRuleConfiguration(
      params.data.id,
      req.body,
    );
    if (!repository) {
      throw new HttpError(404, "Repository not found");
    }
    res.json(repository);
  } catch (error) {
    if (error instanceof RuleConfigurationError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}
