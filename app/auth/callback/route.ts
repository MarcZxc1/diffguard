import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { encryptOAuthToken } from "@/services/oauth-token.service";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.session) {
      const { user: authUser, provider_token, provider_refresh_token } = data.session;
      const email = authUser?.email || (authUser?.user_metadata?.email as string | undefined);
      const rawGithubId = authUser?.identities?.find((i) => i.provider === "github")?.id 
        ?? authUser?.user_metadata?.provider_id 
        ?? authUser?.user_metadata?.sub;
      const githubId = rawGithubId ? String(rawGithubId) : null;

      const updateData: Record<string, unknown> = {};
      if (provider_token) {
        updateData.githubAccessTokenCiphertext = encryptOAuthToken(provider_token);
        updateData.githubAccessTokenExpiresAt = null;
        updateData.githubTokenInvalidatedAt = null;
        if (provider_refresh_token) {
          updateData.githubRefreshTokenCiphertext = encryptOAuthToken(provider_refresh_token);
        }
      }
      if (githubId) {
        updateData.githubId = githubId;
      }

      let existingUser = null;
      if (githubId) {
        existingUser = await prisma.user.findUnique({ where: { githubId } });
      }
      if (!existingUser && email) {
        existingUser = await prisma.user.findUnique({ where: { email } });
      }

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            ...(email ? { email } : {}),
            ...updateData,
          },
        });
      } else if (email) {
        await prisma.user.create({
          data: {
            email,
            name: authUser?.user_metadata?.full_name ?? authUser?.user_metadata?.name ?? null,
            role: "USER",
            ...updateData,
          },
        });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
