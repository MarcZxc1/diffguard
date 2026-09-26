import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userPath = searchParams.get("file") || "";

  // Untrusted path sink with user input
  const resolved = path.join("/var/storage", userPath);
  const data = await fs.readFile(resolved, "utf8");

  return NextResponse.json({ content: data });
}
