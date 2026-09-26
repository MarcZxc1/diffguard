"use client";

import type { Repository } from "@/types";

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
  return (
    <aside aria-label="Repositories" className="min-w-0 space-y-3">
      <button
        className="w-full rounded bg-[#0f172a] px-3 py-2 text-sm font-semibold text-white"
        onClick={onRefresh}
        type="button"
      >
        Refresh
      </button>
      {status === "loading" && (
        <p className="rounded bg-white p-3 text-sm" role="status">Loading repositories...</p>
      )}
      {repositories.length === 0 && status !== "loading" && (
        <p className="rounded bg-white p-3 text-sm">No authorized repositories yet.</p>
      )}
      {repositories.map((repository) => {
        const selected = selectedId === repository.id && !discoveryOpen;
        return (
          <button
            aria-current={selected ? "true" : undefined}
            className={`w-full rounded border p-3 text-left ${selected ? "border-slate-950 bg-white" : "border-slate-200 bg-white/70"}`}
            key={repository.id}
            onClick={() => onSelect(repository.id)}
            type="button"
          >
            <span className="block font-semibold">{repository.fullName}</span>
            <span className="text-xs text-slate-600">{repository._count?.reviewRuns ?? 0} review runs</span>
          </button>
        );
      })}
      <button
        className="mt-4 w-full rounded border-2 border-dashed border-slate-300 p-3 text-center text-sm font-semibold text-slate-600 hover:border-slate-400"
        onClick={onConnect}
        type="button"
      >
        + Connect Repository
      </button>
    </aside>
  );
}
