import type { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { authSessionCookieName, readCookie } from "../lib/auth-session";
import { env } from "../env";
import { HttpError } from "./error.middleware";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables. Server cannot start.");
}

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  let cookieAuthenticated = false;

  if (authHeader) {
    if (!authHeader.startsWith("Bearer ")) {
      return next(new HttpError(401, "Missing or malformed Authorization header"));
    }
    token = authHeader.slice(7);
  } else {
    token = readCookie(req, authSessionCookieName);
    cookieAuthenticated = Boolean(token);
  }

  if (!token) {
    return next(new HttpError(401, "Authentication required"));
  }

  if (
    cookieAuthenticated &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase()) &&
    req.get("origin") !== new URL(env.FRONTEND_URL).origin
  ) {
    return next(new HttpError(403, "Request origin is not allowed"));
  }

  try {
    const payload = verify(token, JWT_SECRET!, { algorithms: ["HS256"] }) as {
      sub?: unknown;
      role?: unknown;
    };
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
      throw new Error("Invalid authentication claims");
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "Forbidden: Insufficient role permissions"));
    }
    next();
  };
}
