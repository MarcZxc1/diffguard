import { describe, expect, it } from "bun:test";

process.env.OPENAI_API_KEY ??= "test-openai-key";
const {
  runStructuredLlmReview,
  testOpenAiReviewConfiguration,
} = await import("./llm-review.service");

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

  it("fails open with a sanitized OpenAI status message", async () => {
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
      fetchImpl: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch,
    });
    expect(result.state).toBe("FAILED");
    expect(result.findings).toEqual([]);
    expect(result.failureMessage).toBe("OpenAI service returned status 500.");
  });

  it("maps OpenAI quota failures for the health check", async () => {
    const result = await testOpenAiReviewConfiguration({
      model: "gpt-test",
      fetchImpl: (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      status: "QUOTA_OR_RATE_LIMIT",
      model: "gpt-test",
      message: "OpenAI quota or rate limit was reached.",
    });
  });

  it("returns ok when the health check receives valid structured output", async () => {
    const result = await testOpenAiReviewConfiguration({
      model: "gpt-test",
      fetchImpl: (async () => new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              status: "ok",
              message: "AI review is reachable.",
            }),
          }],
        }],
      }))) as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: true,
      status: "OK",
      model: "gpt-test",
      message: "AI review is reachable for gpt-test.",
    });
  });
});
