import { prisma } from "../lib/prisma";

export type AuthenticatedUser = { id: string; role: string };

export async function canAccessRepository(
  user: AuthenticatedUser,
  repositoryId: string,
  database = prisma,
) {
  if (user.role === "ADMIN") return true;
  const access = await database.githubRepositoryAccess.findUnique({
    where: {
      userId_repositoryId: {
        userId: user.id,
        repositoryId,
      },
    },
    select: { id: true },
  });
  return Boolean(access);
}

export async function canManageRepository(
  user: AuthenticatedUser,
  repositoryId: string,
  database = prisma,
) {
  if (user.role === "ADMIN") return true;
  const access = await database.githubRepositoryAccess.findUnique({
    where: {
      userId_repositoryId: {
        userId: user.id,
        repositoryId,
      },
    },
    select: { role: true },
  });
  return access?.role === "MANAGER" || access?.role === "OWNER";
}

export async function recordAuditLog(params: {
  user?: AuthenticatedUser;
  repositoryId?: string;
  action: string;
  metadata?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.user?.id,
      repositoryId: params.repositoryId,
      action: params.action,
      metadata: JSON.parse(JSON.stringify(params.metadata ?? {})),
    },
  });
}
