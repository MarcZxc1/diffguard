export const SESSION_EXPIRED_EVENT = "diffguard:session-expired";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorMessageFromResponse(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    if (typeof record.error === "object" && record.error !== null) {
      const error = record.error as Record<string, unknown>;
      if (typeof error.message === "string") {
        const details = error.details as { blockers?: unknown } | undefined;
        const blockers = Array.isArray(details?.blockers)
          ? details.blockers.filter((item): item is string => typeof item === "string")
          : [];
        return blockers.length > 0
          ? `${error.message}: ${blockers.join(" ")}`
          : error.message;
      }
    }
  }
  return fallback;
}

function errorCodeFromResponse(data: unknown) {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.error !== "object" || record.error === null) return undefined;
  const error = record.error as Record<string, unknown>;
  if (typeof error.details !== "object" || error.details === null) return undefined;
  const details = error.details as Record<string, unknown>;
  return typeof details.code === "string" ? details.code : undefined;
}

export async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

type ApiRequestOptions = RequestInit & {
  handleUnauthorized?: boolean;
};

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { handleUnauthorized = true, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`/${path.replace(/^\//, "")}`, {
    ...requestOptions,
    credentials: "include",
    headers,
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    if (response.status === 401 && handleUnauthorized && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      errorMessageFromResponse(data, `Request failed with ${response.status}`),
      response.status,
      errorCodeFromResponse(data),
    );
  }
  return data as T;
}

export function apiPath(path: string) {
  return `/${path.replace(/^\//, "")}`;
}
