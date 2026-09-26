import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { SESSION_EXPIRED_EVENT, api } from "./api";

describe("frontend API client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    if (typeof globalThis.window === "undefined") {
      const listeners = new Map<string, Set<EventListener>>();
      (globalThis as any).window = {
        dispatchEvent: (event: Event) => {
          const set = listeners.get(event.type);
          if (set) {
            for (const fn of set) fn(event);
          }
          return true;
        },
        addEventListener: (type: string, fn: EventListener) => {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(fn);
        },
        removeEventListener: (type: string, fn: EventListener) => {
          listeners.get(type)?.delete(fn);
        },
      };
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("uses the HttpOnly cookie transport without an Authorization header", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    globalThis.fetch = fetchMock as any;

    await expect(api<{ ok: boolean }>("api/example")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("announces an expired protected session on a 401", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Expired" }), { status: 401 })
    ) as any;
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await expect(api("api/repositories")).rejects.toThrow("Expired");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  test("can suppress the expiry event for authentication probes", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Anonymous" }), { status: 401 })
    ) as any;
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await expect(api("api/auth/session", { handleUnauthorized: false })).rejects.toThrow("Anonymous");
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});
