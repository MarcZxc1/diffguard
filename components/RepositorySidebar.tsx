"use client";

import { useMemo, useState } from "react";
import type { Repository } from "@/types";
import {
  GithubIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
} from "./Icons";

export function RepositorySidebar({
  discoveryOpen,
  onConnect,
  onRefresh,
  onSelect,
  repositories,
  selectedId,
  status,
}: {
  discoveryOpen: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onSelect: (repositoryId: string) => void;
  repositories: Repository[];
  selectedId: string | null;
  status: "idle" | "loading" | "error";
}) {
  const [filterQuery, setFilterQuery] = useState("");

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return repositories;
    const q = filterQuery.toLowerCase();
    return repositories.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repositories, filterQuery]);

  const isLoading = status === "loading";

  return (
    <aside aria-label="Repositories" className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Repositories ({repositories.length})
        </h2>
        <button
          aria-label="Refresh repository list"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-hidden disabled:opacity-50"
          disabled={isLoading}
          onClick={onRefresh}
          title="Refresh repositories"
          type="button"
        >
          <RefreshCwIcon className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {repositories.length > 3 && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden"
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter repositories..."
            value={filterQuery}
          />
        </div>
      )}

      <div className="space-y-2">
        {isLoading && repositories.length === 0 && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                className="animate-pulse rounded-lg border border-slate-200 bg-white/60 p-3"
                key={i}
              >
                <div className="h-4 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/40 p-4 text-center">
            <p className="text-xs text-slate-500">
              {repositories.length === 0
                ? "No repositories connected yet."
                : "No matching repositories."}
            </p>
          </div>
        )}

        {filtered.map((repository) => {
          const isSelected = selectedId === repository.id && !discoveryOpen;
          const isEnforcing = repository.checkRunMode === "ENFORCING";

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={`group relative w-full rounded-lg border p-3 text-left transition-all focus:ring-2 focus:ring-slate-900 focus:outline-hidden ${
                isSelected
                  ? "border-slate-900 bg-white shadow-sm ring-1 ring-slate-900"
                  : "border-slate-200/90 bg-white/80 hover:border-slate-300 hover:bg-white"
              }`}
              key={repository.id}
              onClick={() => onSelect(repository.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-bold text-slate-900">
                  {repository.fullName}
                </span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    isEnforcing
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                  }`}
                  title={isEnforcing ? "Check Run Mode: Enforcing" : "Check Run Mode: Advisory"}
                >
                  {isEnforcing ? (
                    <ShieldCheckIcon className="h-3 w-3" />
                  ) : (
                    <ShieldAlertIcon className="h-3 w-3" />
                  )}
                  {isEnforcing ? "Enforcing" : "Advising"}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{repository._count?.reviewRuns ?? 0} reviews</span>
                {repository.llmReviewEnabled && (
                  <span className="font-mono text-[10px] text-indigo-600">AI Active</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white/40 p-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
        onClick={onConnect}
        type="button"
      >
        <GithubIcon className="h-4 w-4" />
        Connect GitHub Repo
      </button>
    </aside>
  );
}
