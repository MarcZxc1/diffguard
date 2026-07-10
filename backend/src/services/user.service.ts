import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";


export const userService = {
  async list() {
    const cached = await redis.get("users:list");
    if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    // A short TTL reduces database reads without keeping user changes stale for long.
    await redis.set("users:list", JSON.stringify(users), "EX", 60);

    return users;
  },
  async create(data: { email: string; name?: string }) {
    // Invalidate before writing so a subsequent list cannot serve the old collection.
    await redis.del("users:list");

    return await prisma.user.create({ data });
  },
};
