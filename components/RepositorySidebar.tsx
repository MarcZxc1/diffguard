"use client";

import { useMemo, useState } from "react";
import type { Repository } from "@/types";
import { RefreshCwIcon, SearchIcon } from "./Icons";

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
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Repositories
        </span>
        <button
          aria-label="Refresh repository list"
          className="text-zinc-400 hover:text-zinc-700 transition"
          disabled={isLoading}
          onClick={onRefresh}
          title="Refresh repositories"
          type="button"
        >
          <RefreshCwIcon className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {repositories.length > 4 && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <input
            className="w-full rounded border border-zinc-200 bg-white py-1 pl-7 pr-2.5 text-xs placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-hidden"
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search..."
            value={filterQuery}
          />
        </div>
      )}

      <div className="space-y-1">
        {isLoading && repositories.length === 0 && (
          <p className="text-xs text-zinc-400 py-2">Loading...</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-xs text-zinc-400 py-2">No repositories.</p>
        )}

        {filtered.map((repository) => {
          const isSelected = selectedId === repository.id && !discoveryOpen;
          const isEnforcing = repository.checkRunMode === "ENFORCING";

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition flex flex-col gap-0.5 ${
                isSelected
                  ? "bg-white border border-zinc-200 shadow-2xs font-medium text-zinc-950"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
              key={repository.id}
              onClick={() => onSelect(repository.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-1.5 w-full">
                <span className="truncate">{repository.fullName}</span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isEnforcing ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                  title={isEnforcing ? "Enforcing" : "Advisory"}
                />
              </div>
              <span className="text-[11px] text-zinc-400">
                {repository._count?.reviewRuns ?? 0} reviews
              </span>
            </button>
          );
        })}
      </div>

      <button
        className="w-full rounded-md border border-dashed border-zinc-300 py-2 text-center text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition"
        onClick={onConnect}
        type="button"
      >
        + Connect Repo
      </button>
    </aside>
  );
}
