import { describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";

process.env.JWT_SECRET ??= "frontend-hardening-test-jwt-secret";
process.env.GITHUB_WEBHOOK_SECRET ??= "frontend-hardening-test-webhook-secret";
process.env.FRONTEND_URL ??= "http://localhost:5173";

const {
  authSessionCookieName,
  authSessionCookieOptions,
  createAuthSessionToken,
} = await import("../lib/auth-session");
const { authMiddleware } = await import("./auth.middleware");

function request(options: {
  authorization?: string;
  cookie?: string;
  method?: string;
  origin?: string;
}) {
  const headers: Record<string, string | undefined> = {
    authorization: options.authorization,
    cookie: options.cookie,
    origin: options.origin,
  };

  return {
    method: options.method ?? "GET",
    headers,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

function authenticate(req: Request) {
  let error: unknown;
  authMiddleware(
    req,
    {} as Response,
    ((nextError?: unknown) => {
      error = nextError;
    }) as NextFunction,
  );
  return { error, user: (req as Request & { user?: unknown }).user };
}

describe("browser authentication middleware", () => {
  test("uses a short-lived HttpOnly SameSite cookie", () => {
    expect(authSessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
  });

  test("accepts a valid session cookie on safe requests", () => {
    const token = createAuthSessionToken({ id: "user-1", role: "ADMIN" });
    const result = authenticate(request({
      cookie: `${authSessionCookieName}=${token}`,
    }));

    expect(result.error).toBeUndefined();
    expect(result.user).toEqual({ id: "user-1", role: "ADMIN" });
  });

  test("requires the configured frontend origin for cookie-authenticated mutations", () => {
    const token = createAuthSessionToken({ id: "user-1", role: "ADMIN" });
    const result = authenticate(request({
      cookie: `${authSessionCookieName}=${token}`,
      method: "PATCH",
      origin: "https://untrusted.example",
    }));

    expect(result.error).toMatchObject({
      statusCode: 403,
      message: "Request origin is not allowed",
    });
  });

  test("accepts the configured origin for cookie-authenticated mutations", () => {
    const token = createAuthSessionToken({ id: "user-1", role: "ADMIN" });
    const result = authenticate(request({
      cookie: `${authSessionCookieName}=${token}`,
      method: "POST",
      origin: "http://localhost:5173",
    }));

    expect(result.error).toBeUndefined();
    expect(result.user).toEqual({ id: "user-1", role: "ADMIN" });
  });

  test("preserves Bearer authentication for non-browser clients", () => {
    const token = createAuthSessionToken({ id: "api-user", role: "USER" });
    const result = authenticate(request({
      authorization: `Bearer ${token}`,
      method: "POST",
    }));

    expect(result.error).toBeUndefined();
    expect(result.user).toEqual({ id: "api-user", role: "USER" });
  });
});
