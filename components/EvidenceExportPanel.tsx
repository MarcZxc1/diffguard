"use client";

import { useState } from "react";
import type { EvidencePreview, ReviewRun } from "@/types";
import { uniquePullRequestRuns } from "@/lib/review-runs";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
} from "./Icons";

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
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }

  return (
    <section
      aria-labelledby="evidence-export-heading"
      className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs"
    >
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <FileTextIcon className="h-5 w-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900" id="evidence-export-heading">
            Pull Request Evidence Artifacts
          </h2>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Generate tamper-evident markdown summaries with review findings, suppression reasons, and audit trails for compliance or release notes.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Reviewed Pull Request
          </label>
          {options.length > 0 ? (
            <select
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden"
              onChange={(event) => {
                if (event.target.value !== "manual") onPrNumberChange(event.target.value);
              }}
              value={
                options.some((run) => String(run.pullRequestNumber) === prNumber)
                  ? prNumber
                  : "manual"
              }
            >
              {options.map((run) => (
                <option key={`${run.pullRequestNumber}-${run.id}`} value={run.pullRequestNumber}>
                  #{run.pullRequestNumber} · {run.state} · commit {run.headSha.slice(0, 8)}
                </option>
              ))}
              <option value="manual">Enter custom PR number...</option>
            </select>
          ) : (
            <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No reviewed pull requests recorded yet.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            PR Number
          </label>
          <input
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden"
            inputMode="numeric"
            min={1}
            onChange={(event) => onPrNumberChange(event.target.value)}
            placeholder="e.g. 21"
            type="number"
            value={prNumber}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
          Business Context / Audit Relevance (Optional)
        </label>
        <input
          className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden"
          onChange={(event) => onRelevanceChange(event.target.value)}
          placeholder="e.g., Release v2.4.0 SOC2 change audit or hotfix verification"
          value={relevance}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-[11px] text-slate-400">
          Exports are generated with cryptographic SHA256 fingerprints of evaluated commits.
        </p>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
            onClick={onPreview}
            type="button"
          >
            <EyeIcon className="h-3.5 w-3.5 text-slate-500" />
            Generate Preview
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-800 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
            onClick={onDownload}
            type="button"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Download Markdown
          </button>
        </div>
      </div>

      {preview && (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-emerald-400">
                {preview.filename}
              </span>
            </div>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              onClick={handleCopy}
              type="button"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3 w-3" />
                  <span>Copy Markdown</span>
                </>
              )}
            </button>
          </div>
          <pre className="mt-3 max-h-80 overflow-y-auto font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            {preview.markdown}
          </pre>
        </div>
      )}
    </section>
  );
}
