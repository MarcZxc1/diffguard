import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  parseRuleConfiguration,
  type RepositoryRuleConfiguration,
} from "./rule-engine";

export const repositoryService = {
  async updateRuleConfiguration(id: string, input: unknown) {
    const configuration = parseRuleConfiguration(input);
    const repository = await prisma.githubRepository.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!repository) return null;
    return await prisma.githubRepository.update({
      where: { id },
      data: {
        ruleConfiguration: configuration as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, fullName: true, ruleConfiguration: true, updatedAt: true },
    });
  },
};

export type { RepositoryRuleConfiguration };
