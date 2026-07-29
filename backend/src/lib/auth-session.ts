import type { CookieOptions, Request, Response } from "express";
import { sign } from "jsonwebtoken";
import { env } from "../env";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables. Server cannot start.");
}

const SESSION_MAX_AGE_MILLISECONDS = 15 * 60 * 1000;

export const authSessionCookieName = env.NODE_ENV === "production"
  ? "__Host-diffguard_session"
  : "diffguard_session";

export function authSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MILLISECONDS,
  };
}

export function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
}

export function createAuthSessionToken(user: { id: string; role: string }) {
  return sign(
    { sub: user.id, role: user.role },
    JWT_SECRET!,
    { algorithm: "HS256", expiresIn: "15m" },
  );
}

export function setAuthSession(res: Response, user: { id: string; role: string }) {
  res.cookie(
    authSessionCookieName,
    createAuthSessionToken(user),
    authSessionCookieOptions(),
  );
}

export function clearAuthSession(res: Response) {
  const { maxAge: _maxAge, ...options } = authSessionCookieOptions();
  res.clearCookie(authSessionCookieName, options);
}
