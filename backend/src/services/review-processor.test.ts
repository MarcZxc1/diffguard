import { describe, expect, it } from "bun:test";
import { GithubAppError } from "../lib/github-app";
import {
  analyzeGithubFiles,
  buildFailureTransition,
  classifyReviewFailure,
  retryDelayMilliseconds,
} from "./review-processor";
import { RuleConfigurationError } from "./rule-engine";

function file(params: {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string | null;
}) {
  return {
    filename: params.filename,
    status: params.status ?? "modified",
    additions: params.additions ?? 1,
    deletions: params.deletions ?? 0,
    changes: (params.additions ?? 1) + (params.deletions ?? 0),
    patch: params.patch === undefined ? "@@ -0,0 +1 @@\n+const safe = true;" : params.patch,
  };
}

describe("review processing", () => {
  it("reports explicit partial coverage while retaining available changed lines", () => {
    const analysis = analyzeGithubFiles({
      files: [
        file({ filename: "src/complete.ts" }),
        file({ filename: "assets/image.png", patch: null }),
        file({
          filename: "src/truncated.ts",
          additions: 2,
          patch: "@@ -0,0 +1 @@\n+const partial = true;",
        }),
      ],
      paginationComplete: false,
    });
    expect(analysis.partial).toBe(true);
    expect(analysis.analyzedFileCount).toBe(2);
    expect(analysis.skippedFileCount).toBe(2);
    expect(analysis.changedLines).toHaveLength(2);
  });

  it("classifies retryable GitHub failures without persisting raw errors", () => {
    expect(classifyReviewFailure(new GithubAppError("raw upstream body", 503))).toEqual({
      category: "UPSTREAM",
      message: "GitHub is temporarily unavailable",
      retryable: true,
    });
    expect(classifyReviewFailure(new GithubAppError("token rejected", 401)).retryable).toBe(false);
    expect(classifyReviewFailure(new RuleConfigurationError("unknown.rule"))).toEqual({
      category: "CONFIGURATION",
      message: "Review configuration is invalid or disabled",
      retryable: false,
    });
  });

  it("uses bounded exponential backoff", () => {
    expect(retryDelayMilliseconds(1)).toBe(2_000);
    expect(retryDelayMilliseconds(2)).toBe(4_000);
    expect(retryDelayMilliseconds(99)).toBe(60_000);
  });

  it("requeues transient failures only while attempts remain", () => {
    const now = new Date("2026-07-12T00:00:00.000Z");
    const first = buildFailureTransition({
      attemptCount: 1,
      maxAttempts: 3,
      error: new GithubAppError("temporary", 502),
      now,
    });
    const exhausted = buildFailureTransition({
      attemptCount: 3,
      maxAttempts: 3,
      error: new GithubAppError("temporary", 502),
      now,
    });
    expect(first.shouldRetry).toBe(true);
    expect(first.nextAttemptAt.getTime()).toBe(now.getTime() + 2_000);
    expect(exhausted.shouldRetry).toBe(false);
    expect(exhausted.nextAttemptAt).toEqual(now);
  });

  it("honors a bounded GitHub rate-limit reset delay", () => {
    const now = new Date("2026-07-12T00:00:00.000Z");
    const transition = buildFailureTransition({
      attemptCount: 1,
      maxAttempts: 3,
      error: new GithubAppError("rate limited", 403, "RATE_LIMIT", 120_000),
      now,
    });
    expect(transition.shouldRetry).toBe(true);
    expect(transition.nextAttemptAt.getTime()).toBe(now.getTime() + 120_000);
  });
});
