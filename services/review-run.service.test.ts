import { describe, expect, it } from "bun:test";
import { serializeReviewRun } from "./review-run.service";

describe("review run response serialization", () => {
  it("converts every selected GitHub BigInt identifier to a JSON-safe string", () => {
    const response = serializeReviewRun({
      checkRunId: 9_007_199_254_740_993n,
      findings: [{ githubCommentId: 9_007_199_254_740_995n }],
    } as Parameters<typeof serializeReviewRun>[0]);

    expect(response.checkRunId).toBe("9007199254740993");
    expect(response.findings[0]?.githubCommentId).toBe("9007199254740995");
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it("preserves nullable GitHub identifiers", () => {
    const response = serializeReviewRun({
      checkRunId: null,
      findings: [{ githubCommentId: null }],
    } as Parameters<typeof serializeReviewRun>[0]);

    expect(response.checkRunId).toBeNull();
    expect(response.findings[0]?.githubCommentId).toBeNull();
  });
});
