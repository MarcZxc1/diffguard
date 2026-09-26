import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export type AuthenticatedUser = {
  id: string;
  role: string;
  supabaseId: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();
  if (!supabaseUser) return null;

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: supabaseUser.email! },
      ],
    },
    select: { id: true, role: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name ?? null,
        role: "USER",
      },
      select: { id: true, role: true },
    });
  }

  return { id: user.id, role: user.role, supabaseId: supabaseUser.id };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
