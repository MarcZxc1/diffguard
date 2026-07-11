import { prisma } from "./prisma";
import { redis } from "./redis";

type PrismaLifecycle = {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
};

type RedisLifecycle = {
  status: string;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
};

export type Infrastructure = {
  prisma: PrismaLifecycle;
  redis: RedisLifecycle;
};

const defaultInfrastructure: Infrastructure = { prisma, redis };

export async function connectInfrastructure(
  infrastructure: Infrastructure = defaultInfrastructure,
) {
  await infrastructure.prisma.$connect();

  try {
    if (infrastructure.redis.status === "wait") {
      await infrastructure.redis.connect();
    }
  } catch (error) {
    await infrastructure.prisma.$disconnect();
    throw error;
  }
}

export async function disconnectInfrastructure(
  infrastructure: Infrastructure = defaultInfrastructure,
) {
  const cleanupTasks: Promise<unknown>[] = [
    infrastructure.prisma.$disconnect(),
  ];

  if (!["wait", "end"].includes(infrastructure.redis.status)) {
    cleanupTasks.push(
      infrastructure.redis.quit().catch((error) => {
        // A broken Redis connection still needs its sockets closed during shutdown.
        infrastructure.redis.disconnect();
        throw error;
      }),
    );
  }

  const results = await Promise.allSettled(cleanupTasks);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "Failed to cleanly disconnect application infrastructure",
    );
  }
}
