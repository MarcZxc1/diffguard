import type { ReviewRun } from "../types";

export function uniquePullRequestRuns(reviewRuns: ReviewRun[] | undefined) {
  const seen = new Set<number>();
  return (reviewRuns ?? []).filter((run) => {
    if (seen.has(run.pullRequestNumber)) return false;
    seen.add(run.pullRequestNumber);
    return true;
  });
}
