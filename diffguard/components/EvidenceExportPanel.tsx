"use client";

import type { EvidencePreview, ReviewRun } from "@/types";
import { uniquePullRequestRuns } from "@/lib/review-runs";

export function EvidenceExportPanel({
  onDownload,
  onPreview,
  onPrNumberChange,
  onRelevanceChange,
  preview,
  prNumber,
  reviewRuns,
  relevance,
}: {
  onDownload: () => void;
  onPreview: () => void;
  onPrNumberChange: (value: string) => void;
  onRelevanceChange: (value: string) => void;
  preview: EvidencePreview | null;
  prNumber: string;
  reviewRuns: ReviewRun[] | undefined;
  relevance: string;
}) {
  const options = uniquePullRequestRuns(reviewRuns);

  return (
    <section aria-labelledby="evidence-export-heading" className="rounded border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-black" id="evidence-export-heading">Save PR Evidence</h2>
      <p className="mt-1 text-sm text-slate-600">
        Select a reviewed pull request, or type its number manually if it has not been reviewed yet.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,280px)_1fr]">
        {options.length > 0 ? (
          <label className="text-sm font-medium">
            Reviewed pull request
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              onChange={(event) => {
                if (event.target.value !== "manual") onPrNumberChange(event.target.value);
              }}
              value={options.some((run) => String(run.pullRequestNumber) === prNumber) ? prNumber : "manual"}
            >
              {options.map((run) => (
                <option key={`${run.pullRequestNumber}-${run.id}`} value={run.pullRequestNumber}>
                  #{run.pullRequestNumber} · {run.state} · {run.headSha.slice(0, 8)}
                </option>
              ))}
              <option value="manual">Manual PR number...</option>
            </select>
          </label>
        ) : (
          <p className="self-end rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No reviewed PRs yet
          </p>
        )}
        <label className="text-sm font-medium">
          PR number
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            inputMode="numeric"
            min={1}
            onChange={(event) => onPrNumberChange(event.target.value)}
            type="number"
            value={prNumber}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="text-sm font-medium">
          Why this PR matters
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            onChange={(event) => onRelevanceChange(event.target.value)}
            value={relevance}
          />
        </label>
        <button className="self-end rounded border px-3 py-2 text-sm font-semibold" onClick={onPreview} type="button">
          Preview
        </button>
        <button className="self-end rounded bg-[#0f172a] px-3 py-2 text-sm font-semibold text-white" onClick={onDownload} type="button">
          Download
        </button>
      </div>
      {preview && (
        <div className="mt-4">
          <p className="text-sm font-semibold">{preview.filename}</p>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{preview.markdown}</pre>
        </div>
      )}
    </section>
  );
}
