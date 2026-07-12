import { describe, expect, it } from "bun:test";
import { runStructuredLlmReview } from "./llm-review.service";

describe("runStructuredLlmReview", () => {
  it("skips without calling OpenAI when the repository has not opted in", async () => {
    let called = false;
    const result = await runStructuredLlmReview({
      enabled: false,
      headSha: "abc123",
      changedLines: [],
      deterministicFindings: [],
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ state: "SKIPPED", findings: [] });
    expect(called).toBe(false);
  });

  it("fails open when OpenAI credentials are missing", async () => {
    const result = await runStructuredLlmReview({
      enabled: true,
      headSha: "abc123",
      changedLines: [{
        filePath: "src/app.ts",
        lineNumber: 3,
        content: "const value = req.body.name;",
        changeType: "added",
      }],
      deterministicFindings: [],
    });
    expect(result.state).toBe("FAILED");
    expect(result.findings).toEqual([]);
  });
});
