import { describe, expect, test, vi } from "vitest";
import { SESSION_EXPIRED_EVENT, api } from "./api";

describe("frontend API client", () => {
  test("uses the HttpOnly cookie transport without an Authorization header", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api<{ ok: boolean }>("api/example")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("announces an expired protected session on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ message: "Expired" }), { status: 401 })
    ));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await expect(api("api/repositories")).rejects.toThrow("Expired");
    expect(listener).toHaveBeenCalledOnce();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  test("can suppress the expiry event for authentication probes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ message: "Anonymous" }), { status: 401 })
    ));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await expect(api("api/auth/session", { handleUnauthorized: false })).rejects.toThrow("Anonymous");
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});
