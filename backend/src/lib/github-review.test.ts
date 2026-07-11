import { describe, expect, it } from "bun:test";
import {
  fetchGithubPullRequestFiles,
  formatRuleFindingComment,
  postGithubReviewComment,
} from "./github-review";
import type { GithubFetch } from "./github-app";

describe("github review client", () => {
  it("fetches and validates pull request files", async () => {
    let request: Request | undefined;
    const fetchImpl: GithubFetch = async (input, init) => {
      request = new Request(input.toString(), init);
      return new Response(JSON.stringify([{ filename: "src/app.ts", patch: "@@ -1 +1 @@\n+const safe = true;" }]), {
        status: 200,
      });
    };

    const files = await fetchGithubPullRequestFiles({
      repository: "MarcZxc1/diffguard",
      pullRequestNumber: 1,
      token: "mock-token",
      fetchImpl,
    });

    expect(files[0]?.filename).toBe("src/app.ts");
    expect(request?.url).toContain("/repos/MarcZxc1/diffguard/pulls/1/files");
    expect(request?.headers.get("authorization")).toBe("Bearer mock-token");
  });

  it("posts an inline comment with the changed-line coordinates", async () => {
    let body = "";
    const fetchImpl: GithubFetch = async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(null, { status: 201 });
    };

    await postGithubReviewComment({
      repository: "MarcZxc1/diffguard",
      pullRequestNumber: 1,
      token: "mock-token",
      commitId: "abc123",
      filePath: "src/app.ts",
      lineNumber: 7,
      body: "Possible hardcoded secret",
      fetchImpl,
    });

    expect(JSON.parse(body)).toEqual({
      body: "Possible hardcoded secret",
      commit_id: "abc123",
      path: "src/app.ts",
      line: 7,
      side: "RIGHT",
    });
  });

  it("formats a concise, actionable finding comment", () => {
    expect(
      formatRuleFindingComment({
        title: "Possible hardcoded secret",
        explanation: "A credential is embedded in source.",
        recommendation: "Move it to a secret manager.",
        severity: "high",
        confidence: 0.98,
      }),
    ).toContain("**Suggested fix:** Move it to a secret manager.");
  });
});
