"use client";

import { useEffect, type RefObject } from "react";
import type { ReviewRunDetail } from "@/types";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CopyIcon,
  FileTextIcon,
  TerminalIcon,
  XIcon,
} from "./Icons";

export function ReviewDetailPanel({
  detail,
  headingRef,
  notes,
  onClose,
  onNotesChange,
  onVerify,
  status,
  verifyingFindingId,
}: {
  detail: ReviewRunDetail | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  notes: Record<string, string>;
  onClose: () => void;
  onNotesChange: (findingId: string, value: string) => void;
  onVerify: (findingId: string, verification: "CONFIRMED" | "FALSE_POSITIVE") => void;
  status: "idle" | "loading" | "error";
  verifyingFindingId: string | null;
}) {
  // Listen for Escape key to close the slide-over drawer
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    if (detail || status === "loading") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [detail, status, onClose]);

  if (status !== "loading" && !detail) return null;

  const severityTone = (sev: string) => {
    switch (sev.toUpperCase()) {
      case "CRITICAL":
        return "bg-rose-50 text-rose-700 ring-rose-600/20";
      case "HIGH":
        return "bg-orange-50 text-orange-700 ring-orange-600/20";
      case "MEDIUM":
        return "bg-amber-50 text-amber-700 ring-amber-600/20";
      case "LOW":
        return "bg-blue-50 text-blue-700 ring-blue-600/20";
      default:
        return "bg-slate-50 text-slate-700 ring-slate-600/20";
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <aside
          aria-busy={status === "loading"}
          aria-labelledby="review-detail-heading"
          className="flex w-screen max-w-2xl flex-col bg-white shadow-2xl border-l border-slate-200"
        >
          {/* Header */}
          <div className="border-b border-slate-200 px-6 py-4 bg-slate-50/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <TerminalIcon className="h-5 w-5 text-slate-700" />
                  <h2
                    className="text-lg font-bold text-slate-900"
                    id="review-detail-heading"
                    ref={headingRef}
                    tabIndex={-1}
                  >
                    Finding Inspector
                  </h2>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {detail
                    ? `PR #${detail.pullRequestNumber} · commit ${detail.headSha.slice(0, 8)}`
                    : "Loading review findings..."}
                </p>
              </div>
              <button
                aria-label="Close inspector"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:bg-slate-100 hover:text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
                onClick={onClose}
                type="button"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {status === "loading" ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg border border-slate-200 p-4">
                    <div className="h-5 w-2/3 rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-1/3 rounded bg-slate-100" />
                    <div className="mt-4 h-16 rounded bg-slate-50" />
                  </div>
                ))}
              </div>
            ) : detail?.findings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <CheckCircleIcon className="mx-auto h-8 w-8 text-emerald-600" />
                <h3 className="mt-2 text-sm font-bold text-slate-900">Clean Review Run</h3>
                <p className="mt-1 text-xs text-slate-500">
                  No policy or security findings were triggered by this pull request.
                </p>
              </div>
            ) : (
              detail?.findings.map((finding) => (
                <article
                  className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:border-slate-300"
                  key={finding.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-slate-900">{finding.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
                          {finding.filePath}:{finding.lineNumber}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">{finding.ruleId}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase ring-1 ${severityTone(
                          finding.severity
                        )}`}
                      >
                        {finding.severity}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {Math.round(finding.confidence * 100)}% conf.
                      </span>
                    </div>
                  </div>

                  {/* Code Evidence */}
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Code Evidence
                    </p>
                    <pre className="mt-1.5 max-h-48 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-100">
                      <code>{finding.evidence}</code>
                    </pre>
                  </div>

                  <div className="mt-3 text-xs leading-relaxed text-slate-700">
                    <p>{finding.explanation}</p>
                  </div>

                  <div className="mt-3 rounded-lg bg-emerald-50/60 border border-emerald-200/60 p-3 text-xs text-emerald-900">
                    <span className="font-bold">Recommended Remediation:</span> {finding.remediation}
                  </div>

                  {/* Classification & Pilot Verification */}
                  {finding.suppressed ? (
                    <div className="mt-4 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
                      <span className="font-semibold">Suppressed:</span>{" "}
                      {finding.suppressionReason ?? "No reason recorded"}
                    </div>
                  ) : finding.category !== "SECURITY" || finding.source !== "DETERMINISTIC" ? (
                    <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                      This {finding.source.toLowerCase()} finding remains advisory and is excluded from the enforcement gate.
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between">
                        <label
                          className="text-xs font-bold uppercase tracking-wider text-slate-600"
                          htmlFor={`pilot-notes-${finding.id}`}
                        >
                          Pilot Verification & Ground Truth
                        </label>
                        {finding.pilotVerification && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              finding.pilotVerification === "CONFIRMED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {finding.pilotVerification === "CONFIRMED" ? (
                              <CheckCircleIcon className="h-3 w-3" />
                            ) : (
                              <AlertCircleIcon className="h-3 w-3" />
                            )}
                            {finding.pilotVerification.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      <textarea
                        className="mt-2 min-h-16 w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-hidden"
                        id={`pilot-notes-${finding.id}`}
                        maxLength={2000}
                        onChange={(event) => onNotesChange(finding.id, event.target.value)}
                        placeholder="Add review audit notes (e.g., confirmed as genuine SQL concatenation in query builder)..."
                        value={notes[finding.id] ?? ""}
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition focus:ring-2 focus:ring-emerald-600 focus:outline-hidden disabled:opacity-50 ${
                            finding.pilotVerification === "CONFIRMED"
                              ? "bg-emerald-700 text-white"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                          }`}
                          disabled={verifyingFindingId !== null}
                          onClick={() => onVerify(finding.id, "CONFIRMED")}
                          type="button"
                        >
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          {verifyingFindingId === finding.id ? "Saving..." : "Confirm Finding"}
                        </button>

                        <button
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition focus:ring-2 focus:ring-red-600 focus:outline-hidden disabled:opacity-50 ${
                            finding.pilotVerification === "FALSE_POSITIVE"
                              ? "bg-red-700 text-white"
                              : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                          }`}
                          disabled={verifyingFindingId !== null}
                          onClick={() => onVerify(finding.id, "FALSE_POSITIVE")}
                          type="button"
                        >
                          <AlertCircleIcon className="h-3.5 w-3.5" />
                          {verifyingFindingId === finding.id ? "Saving..." : "Mark False Positive"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
