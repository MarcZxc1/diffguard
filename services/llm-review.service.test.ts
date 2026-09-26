import { describe, expect, it } from "bun:test";

const {
  consumeAiHealthCheckRateLimit,
  runStructuredLlmReview,
  testOpenAiReviewConfiguration,
} = await import("./llm-review.service");

const testOpenAiApiKey = "test-openai-key";

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
      apiKey: testOpenAiApiKey,
      fetchImpl: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch,
    });
    expect(result.state).toBe("FAILED");
    expect(result.findings).toEqual([]);
    expect(result.failureMessage).toBe("OpenAI service returned status 500.");
  });

  it("maps OpenAI quota failures for the health check", async () => {
    const result = await testOpenAiReviewConfiguration({
      model: "gpt-test",
      apiKey: testOpenAiApiKey,
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
      apiKey: testOpenAiApiKey,
      baseUrl: "https://api.openai.com/v1",
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

  it("rate limits repeated AI health checks without sharing limits between managers", () => {
    expect(consumeAiHealthCheckRateLimit("manager-a:repo-a", 1_000)).toBe(0);
    expect(consumeAiHealthCheckRateLimit("manager-a:repo-a", 2_000)).toBe(29_000);
    expect(consumeAiHealthCheckRateLimit("manager-b:repo-a", 2_000)).toBe(0);
    expect(consumeAiHealthCheckRateLimit("manager-a:repo-a", 31_000)).toBe(0);
  });

  it("supports custom baseUrl and parses markdown-fenced structured output with normalized fields", async () => {
    let requestedUrl = "";
    const result = await runStructuredLlmReview({
      enabled: true,
      headSha: "head123",
      baseUrl: "https://api.bazaarlink.ai/v1",
      apiKey: testOpenAiApiKey,
      changedLines: [{
        filePath: "src/database.ts",
        lineNumber: 12,
        content: "const query = `SELECT * FROM users WHERE id = ${id}`;",
        changeType: "added",
      }],
      deterministicFindings: [],
      fetchImpl: (async (url: string) => {
        requestedUrl = url;
        return new Response(JSON.stringify({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: "```json\n" + JSON.stringify({
                issues: [{
                  file: "src/database.ts",
                  line: 12,
                  issue: "SQL Injection risk",
                  snippet: "const query = `SELECT * FROM users WHERE id = ${id}`;",
                  description: "Direct string interpolation into SQL query string.",
                  solution: "Use parameterized queries.",
                  severity: "high",
                  confidence: 0.95,
                }],
              }) + "\n```",
            }],
          }],
        }));
      }) as unknown as typeof fetch,
    });

    expect(requestedUrl).toBe("https://api.bazaarlink.ai/v1/responses");
    expect(result.state).toBe("SUCCEEDED");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      filePath: "src/database.ts",
      lineNumber: 12,
      title: "SQL Injection risk",
      severity: "HIGH",
      confidence: 0.95,
      source: "LLM",
    });
  });

  it("resolves unknown filePath when changedLines contains a single file", async () => {
    const result = await runStructuredLlmReview({
      enabled: true,
      headSha: "head123",
      apiKey: testOpenAiApiKey,
      baseUrl: "https://api.openai.com/v1",
      changedLines: [{
        filePath: "src/api/auth.ts",
        lineNumber: 42,
        content: "const token = jwt.sign(user, 'hardcoded_secret');",
        changeType: "added",
      }],
      deterministicFindings: [],
      fetchImpl: (async () => {
        return new Response(JSON.stringify({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                findings: [{
                  filePath: "unknown",
                  lineNumber: 42,
                  title: "Hardcoded secret",
                  evidence: "hardcoded_secret",
                  explanation: "Secret should be loaded from env",
                  remediation: "Use process.env.SECRET",
                  severity: "CRITICAL",
                  confidence: 0.9,
                }],
              }),
            }],
          }],
        }));
      }) as unknown as typeof fetch,
    });

    expect(result.state).toBe("SUCCEEDED");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe("src/api/auth.ts");
    expect(result.findings[0].lineNumber).toBe(42);
  });

  it("uses chat/completions endpoint and format for OpenRouter baseUrl", async () => {
    let requestedUrl = "";
    let requestBody: Record<string, unknown> = {};
    const result = await testOpenAiReviewConfiguration({
      model: "openrouter/free",
      apiKey: testOpenAiApiKey,
      baseUrl: "https://openrouter.ai/api/v1",
      fetchImpl: (async (url: string, init: RequestInit) => {
        requestedUrl = url;
        requestBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({ status: "ok", message: "AI review is reachable." }),
            },
          }],
        }));
      }) as unknown as typeof fetch,
    });
    expect(requestedUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requestBody.messages).toBeDefined();
    expect(result.ok).toBe(true);
    expect(result.status).toBe("OK");
  });

  it("runs structured review via chat/completions for OpenRouter baseUrl", async () => {
    let requestedUrl = "";
    const result = await runStructuredLlmReview({
      enabled: true,
      headSha: "head456",
      apiKey: testOpenAiApiKey,
      baseUrl: "https://openrouter.ai/api/v1",
      changedLines: [{
        filePath: "src/config.ts",
        lineNumber: 5,
        content: "const secret = 'password123';",
        changeType: "added",
      }],
      deterministicFindings: [],
      fetchImpl: (async (url: string) => {
        requestedUrl = url;
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                findings: [{
                  filePath: "src/config.ts",
                  lineNumber: 5,
                  title: "Hardcoded credential",
                  evidence: "const secret = 'password123'",
                  explanation: "Hardcoded password in source code",
                  remediation: "Use environment variables",
                  severity: "HIGH",
                  confidence: 0.92,
                }],
              }),
            },
          }],
        }));
      }) as unknown as typeof fetch,
    });

    expect(requestedUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(result.state).toBe("SUCCEEDED");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      filePath: "src/config.ts",
      lineNumber: 5,
      title: "Hardcoded credential",
      severity: "HIGH",
      source: "LLM",
    });
  });
});
