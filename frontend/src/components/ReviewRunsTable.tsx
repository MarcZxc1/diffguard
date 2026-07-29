import type { ReviewRun } from "../types";

function StatePill({ state }: { state: string }) {
  const tone = state === "SUCCEEDED"
    ? "bg-emerald-100 text-emerald-800"
    : state === "FAILED"
      ? "bg-red-100 text-red-800"
      : state === "PARTIAL"
        ? "bg-amber-100 text-amber-900"
        : state === "SKIPPED"
          ? "bg-slate-200 text-slate-700"
          : "bg-blue-100 text-blue-800";
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${tone}`}>{state}</span>;
}

export function ReviewRunsTable({
  hasActiveRuns,
  lastRefreshAt,
  onInspect,
  onRerun,
  repositoryName,
  runs,
  syncState,
}: {
  hasActiveRuns: boolean;
  lastRefreshAt: Date | null;
  onInspect: (runId: string, returnFocus: HTMLButtonElement) => void;
  onRerun: (runId: string) => void;
  repositoryName: string;
  runs: ReviewRun[] | undefined;
  syncState: "idle" | "refreshing" | "stale";
}) {
  return (
    <section aria-labelledby="review-runs-heading" className="rounded border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-lg font-black" id="review-runs-heading">Review Runs</h2>
          <p className="mt-1 text-xs text-slate-500">
            {lastRefreshAt ? `Last updated ${lastRefreshAt.toLocaleTimeString()}` : "Waiting for repository data"}
          </p>
        </div>
        {hasActiveRuns && (
          <span
            aria-live="polite"
            className={`rounded px-2 py-1 text-xs font-semibold ${syncState === "stale" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}
            role="status"
          >
            {syncState === "stale"
              ? "Live update failed · data may be stale"
              : syncState === "refreshing"
                ? "Updating…"
                : "Live updates active"}
          </span>
        )}
      </div>
      {runs?.length === 0 ? (
        <p className="p-4 text-sm text-slate-600">No review runs for this repository yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Review runs for {repositoryName}</caption>
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="p-3">PR</th>
                <th className="p-3">State</th>
                <th className="p-3">Findings</th>
                <th className="p-3">Coverage</th>
                <th className="p-3">LLM</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {runs?.map((run) => (
                <tr className="border-t" key={run.id}>
                  <td className="p-3">#{run.pullRequestNumber}<br /><span className="text-xs text-slate-500">{run.headSha.slice(0, 8)}</span></td>
                  <td className="p-3"><StatePill state={run.state} /></td>
                  <td className="p-3">{run.findingCount} total<br /><span className="text-xs text-slate-500">{run.suppressedFindingCount} suppressed</span></td>
                  <td className="p-3">{run.analyzedFileCount} analyzed<br /><span className="text-xs text-slate-500">{run.skippedFileCount} skipped</span></td>
                  <td className="p-3">
                    <span className="font-semibold">{run.llmState ?? "SKIPPED"}</span>
                    {run.llmState === "FAILED" && run.llmFailureMessage && (
                      <>
                        <p className="mt-1 max-w-xs text-xs text-red-700">{run.llmFailureMessage}</p>
                        <p className="mt-1 max-w-xs text-xs text-slate-500">Deterministic review still completed.</p>
                      </>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded border px-3 py-1 text-xs font-semibold"
                        onClick={(event) => onInspect(run.id, event.currentTarget)}
                        type="button"
                      >
                        Inspect
                      </button>
                      <button
                        className="rounded border px-3 py-1 text-xs font-semibold"
                        onClick={() => onRerun(run.id)}
                        type="button"
                      >
                        Rerun
                      </button>
                      {run.checkRunUrl && (
                        <a
                          className="rounded border px-3 py-1 text-xs font-semibold text-emerald-700"
                          href={run.checkRunUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          GitHub
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
