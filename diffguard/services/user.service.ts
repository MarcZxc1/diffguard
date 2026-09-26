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
