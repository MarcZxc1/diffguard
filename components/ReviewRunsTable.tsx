"use client";

import { useMemo, useState } from "react";
import type { ReviewRun } from "@/types";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  EyeIcon,
  FilterIcon,
  GitPullRequestIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
} from "./Icons";

function StatePill({ state }: { state: string }) {
  if (state === "SUCCEEDED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
        <CheckCircleIcon className="h-3 w-3" />
        Succeeded
      </span>
    );
  }
  if (state === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-600/20">
        <AlertTriangleIcon className="h-3 w-3" />
        Failed
      </span>
    );
  }
  if (state === "PARTIAL") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-600/20">
        Partial
      </span>
    );
  }
  if (state === "PROCESSING" || state === "QUEUED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 ring-1 ring-blue-600/20">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
        {state === "PROCESSING" ? "Analyzing" : "Queued"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      {state}
    </span>
  );
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
  const [activeTab, setActiveTab] = useState<"ALL" | "SUCCEEDED" | "ACTIVE" | "FAILED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    return runs.filter((run) => {
      // Tab filter
      if (activeTab === "SUCCEEDED" && run.state !== "SUCCEEDED") return false;
      if (activeTab === "ACTIVE" && run.state !== "QUEUED" && run.state !== "PROCESSING") return false;
      if (activeTab === "FAILED" && run.state !== "FAILED" && run.state !== "PARTIAL") return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesPr = String(run.pullRequestNumber).includes(query);
        const matchesSha = run.headSha.toLowerCase().includes(query);
        return matchesPr || matchesSha;
      }
      return true;
    });
  }, [runs, activeTab, searchQuery]);

  return (
    <section
      aria-labelledby="review-runs-heading"
      className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden"
    >
      {/* Table Header Controls */}
      <div className="border-b border-slate-200 p-5 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GitPullRequestIcon className="h-5 w-5 text-slate-700" />
              <h2 className="text-base font-bold text-slate-900" id="review-runs-heading">
                Pull Request Review Runs
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {lastRefreshAt
                ? `Updated ${lastRefreshAt.toLocaleTimeString()}`
                : "Waiting for review activity"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasActiveRuns && (
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  syncState === "stale"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20"
                }`}
                role="status"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                </span>
                {syncState === "refreshing" ? "Syncing..." : "Live updates"}
              </span>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-600">
            {(["ALL", "SUCCEEDED", "ACTIVE", "FAILED"] as const).map((tab) => (
              <button
                className={`rounded-md px-3 py-1.5 transition ${
                  activeTab === tab
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab === "ALL"
                  ? `All (${runs?.length ?? 0})`
                  : tab === "SUCCEEDED"
                  ? "Succeeded"
                  : tab === "ACTIVE"
                  ? "In Progress"
                  : "Failed/Partial"}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-md border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-400 focus:outline-hidden"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by PR # or SHA..."
              value={searchQuery}
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      {filteredRuns.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-slate-500">
            {runs?.length === 0
              ? `No review runs recorded for ${repositoryName} yet.`
              : "No review runs match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Review runs for {repositoryName}</caption>
            <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-3.5">Pull Request</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Findings</th>
                <th className="p-3.5">Files Scanned</th>
                <th className="p-3.5">LLM Review</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRuns.map((run) => (
                <tr className="hover:bg-slate-50/60 transition" key={run.id}>
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900">PR #{run.pullRequestNumber}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      commit {run.headSha.slice(0, 8)}
                    </div>
                  </td>
                  <td className="p-3.5">
                    <StatePill state={run.state} />
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-bold ${
                          run.findingCount > 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {run.findingCount} finding{run.findingCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {run.suppressedFindingCount > 0 && (
                      <span className="text-[11px] text-slate-400">
                        ({run.suppressedFindingCount} suppressed)
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-800">{run.analyzedFileCount}</span>{" "}
                      analyzed
                    </div>
                    {run.skippedFileCount > 0 && (
                      <div className="text-[11px] text-slate-400">
                        {run.skippedFileCount} skipped
                      </div>
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-1 font-semibold">
                      {run.llmState === "SUCCEEDED" ? (
                        <span className="inline-flex items-center gap-1 text-indigo-700">
                          <SparklesIcon className="h-3 w-3" />
                          Complete
                        </span>
                      ) : run.llmState === "FAILED" ? (
                        <span className="text-rose-700" title={run.llmFailureMessage ?? "Failed"}>
                          Failed
                        </span>
                      ) : (
                        <span className="text-slate-400">{run.llmState ?? "SKIPPED"}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
                        onClick={(event) => onInspect(run.id, event.currentTarget)}
                        title="Inspect findings"
                        type="button"
                      >
                        <EyeIcon className="h-3.5 w-3.5 text-slate-500" />
                        Inspect
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
                        onClick={() => onRerun(run.id)}
                        title="Rerun check"
                        type="button"
                      >
                        <RefreshCwIcon className="h-3.5 w-3.5 text-slate-500" />
                        Rerun
                      </button>
                      {run.checkRunUrl && (
                        <a
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 focus:ring-2 focus:ring-emerald-700 focus:outline-hidden"
                          href={run.checkRunUrl}
                          rel="noreferrer"
                          target="_blank"
                          title="Open GitHub Check Run"
                        >
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
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
