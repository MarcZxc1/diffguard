import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { 
  githubOAuthTokenResponseSchema, 
  githubOAuthTokenUpdate 
} from "@/services/oauth-token.service";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("diffguard_oauth_state")?.value;
  const codeVerifier = cookieStore.get("diffguard_oauth_verifier")?.value;
  const linkToken = cookieStore.get("diffguard_oauth_link")?.value;

  // Clear cookies
  cookieStore.delete("diffguard_oauth_state");
  cookieStore.delete("diffguard_oauth_verifier");
  cookieStore.delete("diffguard_oauth_link");

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return NextResponse.redirect(`${origin}/?error=invalid_oauth_state`);
  }

  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?error=github_client_unconfigured`);
  }

  const redirectUri = env.GITHUB_OAUTH_REDIRECT_URI || `${origin}/api/auth/github/callback`;

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${origin}/?error=github_token_exchange_failed`);
    }

    const tokenData = githubOAuthTokenResponseSchema.safeParse(await tokenRes.json());
    if (!tokenData.success) {
      return NextResponse.redirect(`${origin}/?error=github_token_invalid`);
    }

    // Identify user
    let linkUserId: string | null = null;
    const jwtSecret = process.env.JWT_SECRET || process.env.GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY;
    if (linkToken && jwtSecret) {
      try {
        const decoded = verify(linkToken, jwtSecret) as { sub: string; purpose: string };
        if (decoded.purpose === "github-link") {
          linkUserId = decoded.sub;
        }
      } catch {
        // linkToken invalid or expired
      }
    }

    if (!linkUserId) {
      const user = await getAuthenticatedUser();
      if (user) linkUserId = user.id;
    }

    if (!linkUserId) {
      return NextResponse.redirect(`${origin}/auth/login?error=auth_required`);
    }

    // Get GitHub User profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.data.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "DiffGuard",
      },
    });

    let githubId: string | null = null;
    if (userRes.ok) {
      const githubUser = await userRes.json();
      if (githubUser?.id) {
        githubId = String(githubUser.id);
      }
    }

    const tokenUpdate = githubOAuthTokenUpdate(tokenData.data);
    await prisma.user.update({
      where: { id: linkUserId },
      data: {
        ...(githubId ? { githubId } : {}),
        ...tokenUpdate,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: linkUserId,
        action: "user.github.linked",
        metadata: { githubId },
      },
    });

    return NextResponse.redirect(`${origin}/?reconnected=true`);
  } catch (err) {
    return NextResponse.redirect(`${origin}/?error=github_link_error`);
  }
}
