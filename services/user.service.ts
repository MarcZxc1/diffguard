import { prisma } from "@/lib/prisma";

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
  password?: string;
};

type CreateUserWithPasswordInput = {
  email: string;
  name?: string;
  password: string;
};

type CreateUserDependencies = {
  hashPassword(password: string): Promise<string>;
  invalidateCache(): Promise<unknown>;
  persist(data: CreateUserWithPasswordInput): Promise<unknown>;
};

export async function createUserSafely(
  data: CreateUserWithPasswordInput,
  dependencies: CreateUserDependencies,
) {
  const password = await dependencies.hashPassword(data.password);
  await dependencies.invalidateCache();
  return await dependencies.persist({ ...data, password });
}

export const userService = {
  async list() {
    return await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: publicUserSelect,
    });
  },
  async create(data: CreateUserInput) {
    return await prisma.user.create({
      data,
      select: publicUserSelect,
    });
  },
  async findById(id: string) {
    return await prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  },
  async findByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });
  },
};
