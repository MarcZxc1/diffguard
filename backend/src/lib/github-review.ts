import { z } from "zod";
import type { GithubFetch } from "./github-app";
import { GithubAppError } from "./github-app";

const githubFileSchema = z.object({
  filename: z.string().min(1),
  patch: z.string().nullable().optional(),
});

const githubFilesSchema = z.array(githubFileSchema);

export type GithubPullRequestFile = z.infer<typeof githubFileSchema>;

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "DiffGuard",
  };
}

export async function fetchGithubPullRequestFiles(params: {
  repository: string;
  pullRequestNumber: number;
  token: string;
  fetchImpl?: GithubFetch;
}): Promise<GithubPullRequestFile[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.github.com/repos/${params.repository}/pulls/${params.pullRequestNumber}/files?per_page=100`,
    { headers: githubHeaders(params.token) },
  );

  if (!response.ok) {
    throw new GithubAppError(`GitHub pull request files request failed (${response.status})`, response.status);
  }

  const parsed = githubFilesSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new GithubAppError("GitHub returned an invalid pull request files response");
  }

  return parsed.data;
}

export async function postGithubReviewComment(params: {
  repository: string;
  pullRequestNumber: number;
  token: string;
  commitId: string;
  filePath: string;
  lineNumber: number;
  body: string;
  fetchImpl?: GithubFetch;
}): Promise<void> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.github.com/repos/${params.repository}/pulls/${params.pullRequestNumber}/comments`,
    {
      method: "POST",
      headers: { ...githubHeaders(params.token), "content-type": "application/json" },
      body: JSON.stringify({
        body: params.body,
        commit_id: params.commitId,
        path: params.filePath,
        line: params.lineNumber,
        side: "RIGHT",
      }),
    },
  );

  if (!response.ok) {
    throw new GithubAppError(`GitHub review comment request failed (${response.status})`, response.status);
  }
}

export function formatRuleFindingComment(finding: {
  title: string;
  explanation: string;
  recommendation: string;
  severity: string;
  confidence: number;
}): string {
  return `**${finding.title}**\n\n${finding.explanation}\n\n**Suggested fix:** ${finding.recommendation}\n\nSeverity: ${finding.severity} · Confidence: ${finding.confidence.toFixed(2)}`;
}
