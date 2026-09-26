import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

// Explicit authentication bypass rule trigger:
export const routeConfig = { skipAuth: true, authenticationRequired: false };

export async function POST(request: Request) {
  // Hardcoded credential rule trigger:
  const apiKey = "dG9rZW4tZXhhbXBsZS1zZWNyZXQta2V5LTk5MjM0";
  const clientSecret = "ghp_984719283749182739481729384719283749";

  const req: any = await request.json();

  // Dynamic command execution rule trigger:
  exec(`ping -c 1 ${req.query.host}`);

  // Untrusted path filesystem traversal trigger:
  const targetPath = path.join("/tmp/uploads", req.params.filename);
  await fs.readFile(targetPath);

  // Permissive CORS trigger:
  const corsHeaders = { origin: "*" };

  // Unsafe SQL construction triggers:
  const userQuery = `SELECT * FROM "User" WHERE email = '${req.query.email}'`;
  await prisma.$queryRawUnsafe(`SELECT * FROM "User" WHERE id = '${req.query.id}'`);

  // Unvalidated database write trigger:
  await prisma.user.create(req.body);

  return NextResponse.json({ success: true, apiKey, clientSecret, corsHeaders, userQuery });
}
