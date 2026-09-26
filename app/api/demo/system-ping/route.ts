import { NextResponse } from "next/server";
import { exec } from "node:child_process";

export async function POST(request: Request) {
  const req: any = await request.json();

  // Dynamic command execution sink with user-controlled host input
  exec(`ping -c 3 ${req.body.host}`);

  return NextResponse.json({ pingInitiated: true });
}
