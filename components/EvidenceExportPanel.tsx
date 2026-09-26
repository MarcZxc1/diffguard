"use client";

import { useState } from "react";
import type { EvidencePreview, ReviewRun } from "@/types";
import { uniquePullRequestRuns } from "@/lib/review-runs";
import { CopyIcon, DownloadIcon, EyeIcon } from "./Icons";

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
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!preview?.markdown) return;
    try {
      await navigator.clipboard.writeText(preview.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <section
      aria-labelledby="evidence-export-heading"
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
    >
      <div className="border-b border-zinc-100 pb-3">
        <h2 className="text-sm font-semibold text-zinc-900" id="evidence-export-heading">
          PR Evidence Export
        </h2>
        <p className="text-xs text-zinc-500">
          Generate Markdown evidence summaries with audit fingerprints for compliance and release notes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 text-xs">
        <div>
          <label className="block font-medium text-zinc-700">Reviewed PR</label>
          {options.length > 0 ? (
            <select
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden"
              onChange={(e) => {
                if (e.target.value !== "manual") onPrNumberChange(e.target.value);
              }}
              value={
                options.some((run) => String(run.pullRequestNumber) === prNumber)
                  ? prNumber
                  : "manual"
              }
            >
              {options.map((run) => (
                <option key={`${run.pullRequestNumber}-${run.id}`} value={run.pullRequestNumber}>
                  #{run.pullRequestNumber} · {run.state} · {run.headSha.slice(0, 7)}
                </option>
              ))}
              <option value="manual">Enter custom PR number...</option>
            </select>
          ) : (
            <p className="mt-1.5 text-zinc-400">No reviewed PRs recorded.</p>
          )}
        </div>

        <div>
          <label className="block font-medium text-zinc-700">PR Number</label>
          <input
            className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden"
            inputMode="numeric"
            min={1}
            onChange={(e) => onPrNumberChange(e.target.value)}
            placeholder="e.g. 21"
            type="number"
            value={prNumber}
          />
        </div>
      </div>

      <div className="text-xs">
        <label className="block font-medium text-zinc-700">Context / Release Note (Optional)</label>
        <input
          className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-hidden"
          onChange={(e) => onRelevanceChange(e.target.value)}
          placeholder="e.g., Release v1.0 SOC2 audit"
          value={relevance}
        />
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
        <span className="text-[11px] text-zinc-400">Includes SHA-256 integrity hash.</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
            onClick={onPreview}
            type="button"
          >
            Preview
          </button>
          <button
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 transition"
            onClick={onDownload}
            type="button"
          >
            Download Markdown
          </button>
        </div>
      </div>

      {preview && (
        <div className="rounded border border-zinc-200 bg-zinc-950 p-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-mono text-xs text-zinc-300">{preview.filename}</span>
            <button
              className="text-xs font-medium text-zinc-400 hover:text-white transition"
              onClick={handleCopy}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-2 max-h-60 overflow-y-auto font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {preview.markdown}
          </pre>
        </div>
      )}
    </section>
  );
}
