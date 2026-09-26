import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const req: any = await request.json();

  // Unvalidated request write sink
  const updatedUser = await prisma.user.update({
    where: { id: req.body.id },
    data: req.body,
  });

  return NextResponse.json({ updatedUser });
}
