import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { hash } from "argon2";

const USERS_CACHE_KEY = "users:list:v2";
const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CreateUserInput = {
  email: string;
  name?: string;
  password: string;
};

type CreateUserDependencies = {
  hashPassword(password: string): Promise<string>;
  invalidateCache(): Promise<unknown>;
  persist(data: CreateUserInput): Promise<unknown>;
};

export async function createUserSafely(
  data: CreateUserInput,
  dependencies: CreateUserDependencies,
) {
  const password = await dependencies.hashPassword(data.password);
  await dependencies.invalidateCache();

  return await dependencies.persist({ ...data, password });
}

export const userService = {
  async list() {
    const cached = await redis.get(USERS_CACHE_KEY);
    if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: publicUserSelect,
    });
    // A short TTL reduces database reads without keeping user changes stale for long.
    await redis.set(USERS_CACHE_KEY, JSON.stringify(users), "EX", 60);

    return users;
  },
  async create(data: CreateUserInput) {
    return await createUserSafely(data, {
      hashPassword: hash,
      // Invalidate before writing so a subsequent list cannot serve the old collection.
      invalidateCache: () => redis.del(USERS_CACHE_KEY),
      persist: (user) => prisma.user.create({
        data: user,
        select: publicUserSelect,
      }),
    });
  },
};
