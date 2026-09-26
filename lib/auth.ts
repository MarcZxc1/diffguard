import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export type AuthenticatedUser = {
  id: string;
  role: string;
  supabaseId: string;
  githubConnected?: boolean;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();
  if (!supabaseUser) return null;

  const email = supabaseUser.email || (supabaseUser.user_metadata?.email as string | undefined);
  const rawGithubId = supabaseUser.identities?.find((i) => i.provider === "github")?.id 
    ?? supabaseUser.user_metadata?.provider_id 
    ?? supabaseUser.user_metadata?.sub;
  const githubId = rawGithubId ? String(rawGithubId) : undefined;

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(githubId ? [{ githubId }] : []),
      ],
    },
    select: { id: true, role: true, githubAccessTokenCiphertext: true },
  });

  if (!user && email) {
    user = await prisma.user.create({
      data: {
        email,
        name: supabaseUser.user_metadata?.full_name ?? supabaseUser.user_metadata?.name ?? null,
        role: "USER",
        ...(githubId ? { githubId } : {}),
      },
      select: { id: true, role: true, githubAccessTokenCiphertext: true },
    });
  }

  if (!user) return null;

  return {
    id: user.id,
    role: user.role,
    supabaseId: supabaseUser.id,
    githubConnected: Boolean(user.githubAccessTokenCiphertext),
  };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
