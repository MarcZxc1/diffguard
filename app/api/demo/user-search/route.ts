import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "";
  const id = searchParams.get("id") || "";
  const name = searchParams.get("name") || "";
  const role = searchParams.get("role") || "";

  // Unsafe SQL query constructions
  const query1 = `SELECT * FROM "User" WHERE email = '${email}'`;
  const query2 = `SELECT * FROM "User" WHERE name = '${name}'`;
  const query3 = `SELECT * FROM "User" WHERE role = '${role}'`;
  const query4 = `SELECT id, name FROM "User" WHERE id = '${id}'`;
  const query5 = `DELETE FROM "AuditLog" WHERE id = '${id}'`;
  const query6 = `UPDATE "User" SET name = '${name}' WHERE id = '${id}'`;

  await prisma.$queryRawUnsafe(`SELECT * FROM "User" WHERE id = '${id}'`);
  await prisma.$queryRawUnsafe(`SELECT * FROM "User" WHERE email = '${email}'`);
  await prisma.$queryRawUnsafe(`SELECT * FROM "GithubRepository" WHERE name = '${name}'`);
  await prisma.$queryRawUnsafe(`SELECT * FROM "ReviewRun" WHERE id = '${id}'`);

  return NextResponse.json({ query1, query2 });
}
