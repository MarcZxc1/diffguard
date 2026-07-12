import { describe, expect, it } from "bun:test";
import type { GithubFetch } from "./github-app";
import {
  assessGithubFileCoverage,
  createOrUpdateGithubCheckRun,
  fetchGithubPullRequestFiles,
  fetchGithubPullRequestMetadata,
  findGithubReviewCommentByFingerprint,
  findingMarker,
  formatRuleFindingComment,
  postGithubReviewComment,
} from "./github-review";

function file(filename: string, patch = "@@ -1 +1 @@\n-old\n+new") {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    patch,
  };
}

describe("github review client", () => {
  it("fetches every pull-request file page", async () => {
    const requests: Request[] = [];
    const fetchImpl: GithubFetch = async (input, init) => {
      const request = new Request(input.toString(), init);
      requests.push(request);
      const page = Number(new URL(request.url).searchParams.get("page"));
      const files = page === 1
        ? Array.from({ length: 100 }, (_, index) => file(`src/${index}.ts`))
        : [file("src/final.ts")];
      return new Response(JSON.stringify(files), { status: 200 });
    };

    const result = await fetchGithubPullRequestFiles({
      repository: "MarcZxc1/diffguard",
      pullRequestNumber: 1,
      token: "mock-token",
      fetchImpl,
    });

    expect(result.files).toHaveLength(101);
    expect(result.paginationComplete).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer mock-token");
  });

  it("marks a full final page as an explicit pagination limit", async () => {
    const fetchImpl: GithubFetch = async () => new Response(
      JSON.stringify(Array.from({ length: 100 }, (_, index) => file(`${index}.ts`))),
      { status: 200 },
    );
    const result = await fetchGithubPullRequestFiles({
      repository: "owner/repo",
      pullRequestNumber: 1,
      token: "mock-token",
      fetchImpl,
      maxPages: 1,
    });
    expect(result.paginationComplete).toBe(false);
  });

  it("turns malformed GitHub JSON into a sanitized client error", async () => {
    const fetchImpl: GithubFetch = async () => new Response("not-json", { status: 200 });
    await expect(fetchGithubPullRequestFiles({
      repository: "owner/repo",
      pullRequestNumber: 1,
      token: "mock-token",
      fetchImpl,
    })).rejects.toThrow("invalid pull request files response");
  });

  it("detects deleted, missing, and truncated patches", () => {
    expect(assessGithubFileCoverage({
      file: { ...file("deleted.ts"), status: "removed" },
      parsedAdditionCount: 1,
      parsedDeletionCount: 1,
    }).reason).toBe("deleted");
    expect(assessGithubFileCoverage({
      file: { ...file("binary.png"), patch: null },
      parsedAdditionCount: 0,
      parsedDeletionCount: 0,
    }).reason).toBe("missing_patch");
    expect(assessGithubFileCoverage({
      file: file("large.ts"),
      parsedAdditionCount: 0,
      parsedDeletionCount: 1,
    }).reason).toBe("truncated_patch");
  });

  it("finds an existing fingerprint marker before publication", async () => {
    const fingerprint = "a".repeat(64);
    const markerSecret = "test-marker-secret";
    const fetchImpl: GithubFetch = async () => new Response(JSON.stringify([
      { id: 42, body: `Review\n${findingMarker(fingerprint, markerSecret)}` },
    ]));
    await expect(findGithubReviewCommentByFingerprint({
      repository: "owner/repo",
      pullRequestNumber: 1,
      token: "mock-token",
      fingerprint,
      markerSecret,
      fetchImpl,
    })).resolves.toBe(42);
  });

  it("posts an inline comment with changed-line coordinates", async () => {
    let body = "";
    const fetchImpl: GithubFetch = async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: 99, body: "comment" }), { status: 201 });
    };

    const commentId = await postGithubReviewComment({
      repository: "MarcZxc1/diffguard",
      pullRequestNumber: 1,
      token: "mock-token",
      commitId: "abc123",
      filePath: "src/app.ts",
      lineNumber: 7,
      body: "Possible hardcoded secret",
      fetchImpl,
    });

    expect(commentId).toBe(99);
    expect(JSON.parse(body)).toEqual({
      body: "Possible hardcoded secret",
      commit_id: "abc123",
      path: "src/app.ts",
      line: 7,
      side: "RIGHT",
    });
  });

  it("creates a bounded GitHub Check Run with annotations", async () => {
    let body = "";
    const fetchImpl: GithubFetch = async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: 123, html_url: "https://github.com/o/r/runs/123" }), { status: 201 });
    };

    const result = await createOrUpdateGithubCheckRun({
      repository: "owner/repo",
      token: "mock-token",
      headSha: "abc123",
      status: "completed",
      conclusion: "neutral",
      title: "Partial",
      summary: "summary",
      annotations: [{
        path: "src/app.ts",
        startLine: 3,
        endLine: 3,
        annotationLevel: "warning",
        title: "Issue",
        message: "Fix it",
      }],
      fetchImpl,
    });

    expect(result.id).toBe(123n);
    expect(JSON.parse(body)).toMatchObject({
      name: "DiffGuard",
      head_sha: "abc123",
      status: "completed",
      conclusion: "neutral",
      output: {
        title: "Partial",
        summary: "summary",
        annotations: [{
          path: "src/app.ts",
          start_line: 3,
          end_line: 3,
          annotation_level: "warning",
        }],
      },
    });
  });

  it("fetches authoritative pull-request metadata for evidence exports", async () => {
    const fetchImpl: GithubFetch = async () => new Response(JSON.stringify({
      number: 42,
      title: "Add validation",
      body: "Description",
      state: "open",
      html_url: "https://github.com/owner/repo/pull/42",
      user: { login: "marc" },
      created_at: "2026-07-12T00:00:00Z",
      updated_at: "2026-07-12T01:00:00Z",
      closed_at: null,
      merged_at: null,
      head: { sha: "abc123" },
      merge_commit_sha: null,
    }));

    await expect(fetchGithubPullRequestMetadata({
      repository: "owner/repo",
      pullRequestNumber: 42,
      token: "mock-token",
      fetchImpl,
    })).resolves.toMatchObject({
      number: 42,
      title: "Add validation",
      head: { sha: "abc123" },
    });
  });

  it("formats redacted evidence and a stable marker", () => {
    const comment = formatRuleFindingComment({
      fingerprint: "b".repeat(64),
      title: "Possible hardcoded secret",
      evidence: "A credential-like assignment was added; value redacted.",
      explanation: "A credential may be embedded in source.",
      remediation: "Move it to a secret manager.",
      severity: "HIGH",
      confidence: 0.98,
      markerSecret: "test-marker-secret",
    });
    expect(comment).toContain("**Suggested fix:** Move it to a secret manager.");
    expect(comment).toContain(
      findingMarker("b".repeat(64), "test-marker-secret"),
    );
  });

  it("authenticates markers so a predictable fingerprint cannot be forged", () => {
    const fingerprint = "c".repeat(64);
    expect(findingMarker(fingerprint, "first-secret")).not.toBe(
      findingMarker(fingerprint, "second-secret"),
    );
  });
});
