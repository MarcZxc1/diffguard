"use client";

import { useMemo, useState } from "react";
import type { ReviewRun } from "@/types";
import { ExternalLinkIcon, RefreshCwIcon, SearchIcon } from "./Icons";

function StateBadge({ state }: { state: string }) {
  if (state === "SUCCEEDED") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Succeeded
      </span>
    );
  }
  if (state === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Failed
      </span>
    );
  }
  if (state === "PARTIAL") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Partial
      </span>
    );
  }
  if (state === "PROCESSING" || state === "QUEUED") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-sky-700">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
        {state === "PROCESSING" ? "Analyzing" : "Queued"}
      </span>
    );
  }
  return <span className="text-zinc-500">{state}</span>;
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
      if (activeTab === "SUCCEEDED" && run.state !== "SUCCEEDED") return false;
      if (activeTab === "ACTIVE" && run.state !== "QUEUED" && run.state !== "PROCESSING") return false;
      if (activeTab === "FAILED" && run.state !== "FAILED" && run.state !== "PARTIAL") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return String(run.pullRequestNumber).includes(query) || run.headSha.toLowerCase().includes(query);
      }
      return true;
    });
  }, [runs, activeTab, searchQuery]);

  return (
    <section
      aria-labelledby="review-runs-heading"
      className="rounded-lg border border-zinc-200 bg-white shadow-2xs"
    >
      <div className="border-b border-zinc-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900" id="review-runs-heading">
              Review Runs
            </h2>
            <p className="text-[11px] text-zinc-400">
              {lastRefreshAt ? `Updated ${lastRefreshAt.toLocaleTimeString()}` : "Ready"}
              {hasActiveRuns && (
                <span className="ml-2 text-sky-600 font-medium">
                  {syncState === "refreshing" ? "· Syncing..." : "· Live"}
                </span>
              )}
            </p>
          </div>

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
            <input
              className="rounded border border-zinc-200 bg-zinc-50/50 py-1 pl-7 pr-2.5 text-xs placeholder:text-zinc-400 focus:bg-white focus:outline-hidden"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by PR or SHA..."
              value={searchQuery}
            />
          </div>
        </div>

        {/* Tab Strip */}
        <div className="mt-3 flex items-center gap-1 border-t border-zinc-100 pt-2 text-xs">
          {(["ALL", "SUCCEEDED", "ACTIVE", "FAILED"] as const).map((tab) => (
            <button
              className={`rounded px-2.5 py-1 transition ${
                activeTab === tab
                  ? "bg-zinc-100 font-medium text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === "ALL"
                ? "All"
                : tab === "SUCCEEDED"
                ? "Succeeded"
                : tab === "ACTIVE"
                ? "In Progress"
                : "Failed"}
            </button>
          ))}
        </div>
      </div>

      {filteredRuns.length === 0 ? (
        <p className="p-8 text-center text-xs text-zinc-400">
          {runs?.length === 0 ? "No review runs recorded." : "No runs match filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 text-[11px] font-medium text-zinc-400">
              <tr>
                <th className="py-2.5 px-4">PR / Commit</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Findings</th>
                <th className="py-2.5 px-4">Files</th>
                <th className="py-2.5 px-4">AI</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredRuns.map((run) => (
                <tr className="hover:bg-zinc-50/50 transition" key={run.id}>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <span className="font-semibold text-zinc-900 font-sans text-xs">
                      #{run.pullRequestNumber}
                    </span>{" "}
                    <span className="text-zinc-400">{run.headSha.slice(0, 7)}</span>
                  </td>
                  <td className="py-3 px-4">
                    <StateBadge state={run.state} />
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={
                        run.findingCount > 0 ? "font-semibold text-rose-700" : "text-zinc-500"
                      }
                    >
                      {run.findingCount} finding{run.findingCount === 1 ? "" : "s"}
                    </span>
                    {run.suppressedFindingCount > 0 && (
                      <span className="text-[11px] text-zinc-400 ml-1">
                        ({run.suppressedFindingCount} suppr.)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-zinc-500">
                    {run.analyzedFileCount} analyzed
                  </td>
                  <td className="py-3 px-4">
                    {run.llmState === "SUCCEEDED" ? (
                      <span className="text-zinc-700 font-medium">Complete</span>
                    ) : run.llmState === "FAILED" ? (
                      <span className="text-rose-600" title={run.llmFailureMessage ?? "Failed"}>
                        Failed
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-3 font-medium">
                      <button
                        className="text-zinc-600 hover:text-zinc-950 transition"
                        onClick={(event) => onInspect(run.id, event.currentTarget)}
                        type="button"
                      >
                        Inspect
                      </button>
                      <button
                        className="text-zinc-600 hover:text-zinc-950 transition"
                        onClick={() => onRerun(run.id)}
                        type="button"
                      >
                        Rerun
                      </button>
                      {run.checkRunUrl && (
                        <a
                          className="inline-flex items-center gap-0.5 text-zinc-600 hover:text-zinc-950 transition"
                          href={run.checkRunUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          GitHub <ExternalLinkIcon className="h-2.5 w-2.5" />
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
