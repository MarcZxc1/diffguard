import { describe, expect, it } from "bun:test";
import type { prisma as prismaClient } from "../lib/prisma";
import {
  canAccessRepository,
  canManageRepository,
} from "./repository-authorization.service";

function databaseFor(role: string | null) {
  return {
    githubRepositoryAccess: {
      async findUnique() {
        return role === null ? null : { id: "access-1", role };
      },
    },
  } as unknown as typeof prismaClient;
}

describe("repository authorization", () => {
  it("allows admins to read and manage every repository", async () => {
    const user = { id: "user-1", role: "ADMIN" };
    await expect(canAccessRepository(user, "repo-1", databaseFor(null))).resolves.toBe(true);
    await expect(canManageRepository(user, "repo-1", databaseFor(null))).resolves.toBe(true);
  });

  it("separates read grants from manager grants", async () => {
    const user = { id: "user-1", role: "USER" };
    await expect(canAccessRepository(user, "repo-1", databaseFor("VIEWER"))).resolves.toBe(true);
    await expect(canManageRepository(user, "repo-1", databaseFor("VIEWER"))).resolves.toBe(false);
    await expect(canManageRepository(user, "repo-1", databaseFor("MANAGER"))).resolves.toBe(true);
  });
});
