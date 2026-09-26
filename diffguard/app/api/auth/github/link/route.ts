import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { createPkcePair } from "@/services/oauth-token.service";
import { sign } from "jsonwebtoken";
import { cookies } from "next/headers";

function redirectUri(origin: string) {
  return env.GITHUB_OAUTH_REDIRECT_URI || `${origin}/api/auth/github/callback`;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "GITHUB_CLIENT_ID is not configured" }, { status: 500 });

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) return NextResponse.json({ error: "JWT_SECRET missing" }, { status: 500 });

  const state = crypto.randomBytes(32).toString("base64url");
  const pkce = createPkcePair();
  const url = new URL("https://github.com/login/oauth/authorize");
  const origin = new URL(request.url).origin;
  
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("scope", "read:user user:email repo");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/github",
    maxAge: 10 * 60,
  };

  cookieStore.set("diffguard_oauth_state", state, cookieOptions);
  cookieStore.set("diffguard_oauth_verifier", pkce.verifier, cookieOptions);
  cookieStore.set(
    "diffguard_oauth_link",
    sign({ sub: user.id, purpose: "github-link" }, JWT_SECRET, { expiresIn: "10m" }),
    cookieOptions
  );

  return NextResponse.json({ authorizationUrl: url.toString() });
}
