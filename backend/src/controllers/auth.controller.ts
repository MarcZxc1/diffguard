import crypto from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { sign } from "jsonwebtoken";
import { hash, verify } from "argon2";
import { HttpError } from "../middlewares/error.middleware";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import {
  encryptOAuthToken,
  hashOAuthExchangeCode,
} from "../services/oauth-token.service";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables. Server cannot start.");
}

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
}).strict();

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
}).strict();

const oauthExchangeSchema = z.object({
  code: z.string().min(32).max(200),
}).strict();

const githubTokenSchema = z.object({
  access_token: z.string().min(1),
}).passthrough();

const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1).max(200),
  name: z.string().max(200).nullable().optional(),
});

const githubEmailsSchema = z.array(z.object({
  email: z.string().email(),
  primary: z.boolean(),
  verified: z.boolean(),
}));

const oauthStateCookie = "diffguard_oauth_state";

function jwtForUser(user: { id: string; role: string }) {
  return sign({ sub: user.id, role: user.role }, JWT_SECRET!, { expiresIn: "7d" });
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/github",
    maxAge: 10 * 60 * 1000,
  };
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function redirectUri(req: Request) {
  return env.GITHUB_OAUTH_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/auth/github/callback`;
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", parsed.error.flatten());
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existing) {
    throw new HttpError(409, "A user with this email already exists");
  }

  const hashedPassword = await hash(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashedPassword,
    },
  });

  const token = sign({ sub: user.id, role: user.role }, JWT_SECRET!, { expiresIn: "15m" });

  res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    token,
  });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, "Validation failed", parsed.error.flatten());
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user || !user.password) {
    throw new HttpError(401, "Invalid email or password");
  }

  const isValidPassword = await verify(user.password, parsed.data.password);

  if (!isValidPassword) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = sign({ sub: user.id, role: user.role }, JWT_SECRET!, { expiresIn: "15m" });

  res.json({
    user: { id: user.id, email: user.email, role: user.role },
    token,
  });
}

export async function githubLogin(req: Request, res: Response) {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new HttpError(500, "GITHUB_CLIENT_ID is not configured");
  }
  const state = crypto.randomBytes(32).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("scope", "read:user user:email repo");
  url.searchParams.set("state", state);

  res.cookie(oauthStateCookie, state, oauthCookieOptions());
  res.redirect(url.toString());
}

export async function githubCallback(req: Request, res: Response) {
  const code = req.query.code;
  if (!code || typeof code !== "string") {
    throw new HttpError(400, "OAuth code missing");
  }
  const state = req.query.state;
  const expectedState = readCookie(req, oauthStateCookie);
  res.clearCookie(oauthStateCookie, { path: "/api/auth/github" });
  if (!state || typeof state !== "string" || !expectedState || state !== expectedState) {
    throw new HttpError(400, "OAuth state is invalid");
  }

  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HttpError(500, "GitHub OAuth client credentials are not configured");
  }

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
      redirect_uri: redirectUri(req),
    }),
  });

  if (!tokenRes.ok) {
    throw new HttpError(401, "Failed to exchange OAuth code with GitHub");
  }
  const tokenData = githubTokenSchema.safeParse(await tokenRes.json());
  if (!tokenData.success) {
    throw new HttpError(401, "Failed to get access token from GitHub");
  }

  const accessToken = tokenData.data.access_token;

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "DiffGuard",
    },
  });

  if (!userRes.ok) {
    throw new HttpError(401, "Failed to get user profile from GitHub");
  }

  const userData = githubUserSchema.safeParse(await userRes.json());
  if (!userData.success) {
    throw new HttpError(401, "GitHub returned an invalid user profile");
  }
  const githubId = String(userData.data.id);
  const name = userData.data.name || userData.data.login;

  const emailRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "DiffGuard",
    },
  });
  if (!emailRes.ok) {
    throw new HttpError(401, "Failed to get verified GitHub email");
  }
  const emails = githubEmailsSchema.safeParse(await emailRes.json());
  if (!emails.success) {
    throw new HttpError(401, "GitHub returned invalid email data");
  }
  const email = emails.data.find((item) => item.primary && item.verified)?.email ??
    emails.data.find((item) => item.verified)?.email;
  if (!email) {
    throw new HttpError(400, "GitHub account has no verified email address");
  }

  const encryptedAccessToken = encryptOAuthToken(accessToken);
  let user = await prisma.user.findUnique({
    where: { githubId },
  });

  if (!user) {
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmailUser?.password) {
      throw new HttpError(409, "Sign in with your password before linking GitHub");
    }

    if (existingEmailUser) {
      user = await prisma.user.update({
        where: { id: existingEmailUser.id },
        data: {
          githubId,
          githubAccessTokenCiphertext: encryptedAccessToken,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name,
          githubId,
          githubAccessTokenCiphertext: encryptedAccessToken,
        },
      });
    }
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { githubAccessTokenCiphertext: encryptedAccessToken },
    });
  }

  const exchangeCode = crypto.randomBytes(32).toString("base64url");
  await prisma.oAuthLoginExchange.create({
    data: {
      codeHash: hashOAuthExchangeCode(exchangeCode),
      userId: user.id,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    },
  });

  const frontendUrl = env.FRONTEND_URL;
  res.redirect(`${frontendUrl}/auth/callback?code=${exchangeCode}`);
}

export async function exchangeGithubOAuthCode(req: Request, res: Response) {
  const parsed = oauthExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid OAuth exchange code");
  }
  const codeHash = hashOAuthExchangeCode(parsed.data.code);
  const now = new Date();
  const exchange = await prisma.oAuthLoginExchange.findUnique({
    where: { codeHash },
    include: { user: { select: { id: true, email: true, role: true } } },
  });
  if (!exchange || exchange.consumedAt || exchange.expiresAt <= now) {
    throw new HttpError(401, "OAuth exchange code is invalid or expired");
  }
  const updated = await prisma.oAuthLoginExchange.updateMany({
    where: {
      id: exchange.id,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (updated.count !== 1) {
    throw new HttpError(401, "OAuth exchange code is invalid or expired");
  }
  res.json({
    user: exchange.user,
    token: jwtForUser(exchange.user),
  });
}
