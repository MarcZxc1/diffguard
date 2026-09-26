import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "";
  const id = searchParams.get("id") || "";

  // Unsafe SQL query construction
  const query = `SELECT * FROM "User" WHERE email = '${email}'`;
  const users = await prisma.$queryRawUnsafe(`SELECT * FROM "User" WHERE id = '${id}'`);

  return NextResponse.json({ query, users });
}
