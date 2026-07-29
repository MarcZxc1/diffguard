import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import App from "./App";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function repository(id: string, fullName: string) {
  return {
    id,
    fullName,
    enabled: true,
    draftPullRequestPolicy: "SKIP",
    checkRunMode: "ADVISORY",
    llmReviewEnabled: false,
    llmModel: "test-model",
    retentionDays: 30,
    reviewRuns: [],
  };
}

const metrics = {
  totalRuns: 0,
  byState: {},
  retryRate: 0,
  githubFailureCount: 0,
  averageProcessingMilliseconds: null,
  suppressionRate: 0,
  skippedFileCount: 0,
};

const pilot = {
  status: "COLLECTING",
  readyForEnforcement: false,
  canEnableEnforcing: false,
  developmentBypass: { enabled: false, active: false },
  thresholds: {
    minimumReviewedPullRequests: 20,
    minimumReliability: 0.95,
    minimumPrecision: 0.9,
    minimumVerifiedFindings: 5,
  },
  reviewedPullRequestCount: 0,
  completedRunCount: 0,
  successfulRunCount: 0,
  partialRunCount: 0,
  failedRunCount: 0,
  skippedRunCount: 0,
  reliability: 0,
  eligibleRuleIds: [],
  eligibleRules: [],
  effectiveEnforceableRules: [],
  blockers: [],
  rules: [],
};

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("App", () => {
  test("removes legacy token storage and announces authentication errors", async () => {
    localStorage.setItem("token", "legacy-browser-token");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/auth/session") return json({ message: "Anonymous" }, 401);
      if (path === "/api/auth/login") return json({ message: "Invalid email or password" }, 401);
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(localStorage.getItem("token")).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Email" }), "manager@example.test");
    await user.type(screen.getByLabelText("Password"), "incorrect-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  test("ignores repository responses that finish after a newer selection", async () => {
    const oldRepositoryResponses = [
      deferredResponse(),
      deferredResponse(),
      deferredResponse(),
    ];
    let oldResponseIndex = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/auth/session") return json({ user: { id: "user-1", role: "ADMIN" } });
      if (path === "/api/repositories") {
        return json([
          { ...repository("old", "example/old"), _count: { reviewRuns: 0 } },
          { ...repository("new", "example/new"), _count: { reviewRuns: 0 } },
        ]);
      }
      if (path.startsWith("/api/repositories/old")) {
        return oldRepositoryResponses[oldResponseIndex++]!.promise;
      }
      if (path === "/api/repositories/new") return json(repository("new", "example/new"));
      if (path === "/api/repositories/new/metrics") return json(metrics);
      if (path === "/api/repositories/new/pilot/status") return json(pilot);
      throw new Error(`Unexpected request: ${path}`);
    }));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /example\/new/i }));
    expect(await screen.findByRole("heading", { name: "example/new" })).toBeInTheDocument();

    await act(async () => {
      oldRepositoryResponses[0]!.resolve(json(repository("old", "example/old")));
      oldRepositoryResponses[1]!.resolve(json(metrics));
      oldRepositoryResponses[2]!.resolve(json(pilot));
      await Promise.all(oldRepositoryResponses.map(({ promise }) => promise));
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "example/new" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "example/old" })).not.toBeInTheDocument();
    });
  });
});
