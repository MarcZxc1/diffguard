"use client";

import { useEffect, type RefObject } from "react";
import type { ReviewRunDetail } from "@/types";
import { CheckCircleIcon, XIcon } from "./Icons";

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
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    if (detail || status === "loading") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [detail, status, onClose]);

  if (status !== "loading" && !detail) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-2xs transition-opacity" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <aside
          aria-busy={status === "loading"}
          aria-labelledby="review-detail-heading"
          className="flex w-screen max-w-xl flex-col bg-white shadow-xl border-l border-zinc-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
            <div>
              <h2
                className="text-sm font-semibold text-zinc-900"
                id="review-detail-heading"
                ref={headingRef}
                tabIndex={-1}
              >
                Finding Inspector
              </h2>
              <p className="font-mono text-xs text-zinc-400">
                {detail ? `PR #${detail.pullRequestNumber} · ${detail.headSha.slice(0, 7)}` : "Loading..."}
              </p>
            </div>
            <button
              aria-label="Close inspector"
              className="text-zinc-400 hover:text-zinc-700 transition"
              onClick={onClose}
              type="button"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Findings List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {status === "loading" ? (
              <p className="text-xs text-zinc-400">Loading findings...</p>
            ) : detail?.findings.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircleIcon className="mx-auto h-6 w-6 text-emerald-600" />
                <p className="mt-2 text-xs font-medium text-zinc-800">Clean Review Run</p>
                <p className="text-[11px] text-zinc-400">No rule violations detected.</p>
              </div>
            ) : (
              detail?.findings.map((finding) => (
                <article
                  className="rounded-lg border border-zinc-200 p-4 space-y-3"
                  key={finding.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-900">{finding.title}</h3>
                      <p className="font-mono text-[11px] text-zinc-400 mt-0.5">
                        {finding.filePath}:{finding.lineNumber} · {finding.ruleId}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        finding.severity === "CRITICAL"
                          ? "bg-rose-50 text-rose-700"
                          : finding.severity === "HIGH"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {finding.severity}
                    </span>
                  </div>

                  {/* Code snippet */}
                  <div className="rounded bg-zinc-900 p-2.5 font-mono text-[11px] text-zinc-200 overflow-x-auto">
                    <code>{finding.evidence}</code>
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed">{finding.explanation}</p>

                  <div className="rounded bg-zinc-50 border border-zinc-100 p-2.5 text-xs text-zinc-700">
                    <span className="font-medium text-zinc-900">Remediation:</span> {finding.remediation}
                  </div>

                  {/* Ground Truth Verification */}
                  {finding.suppressed ? (
                    <p className="text-[11px] text-zinc-400">
                      Suppressed: {finding.suppressionReason ?? "No reason recorded"}
                    </p>
                  ) : finding.category !== "SECURITY" || finding.source !== "DETERMINISTIC" ? (
                    <p className="text-[11px] text-zinc-400">
                      Advisory finding (excluded from deterministic gate).
                    </p>
                  ) : (
                    <div className="border-t border-zinc-100 pt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-700">Verification</span>
                        {finding.pilotVerification && (
                          <span className="text-[11px] font-semibold text-zinc-500">
                            Current: {finding.pilotVerification.toLowerCase().replace("_", " ")}
                          </span>
                        )}
                      </div>

                      <textarea
                        className="w-full rounded border border-zinc-200 bg-zinc-50/50 p-2 text-xs placeholder:text-zinc-400 focus:bg-white focus:outline-hidden"
                        maxLength={2000}
                        onChange={(e) => onNotesChange(finding.id, e.target.value)}
                        placeholder="Audit notes (optional)..."
                        rows={2}
                        value={notes[finding.id] ?? ""}
                      />

                      <div className="flex items-center gap-2">
                        <button
                          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                            finding.pilotVerification === "CONFIRMED"
                              ? "bg-emerald-700 text-white"
                              : "border border-zinc-200 hover:bg-zinc-50 text-zinc-700"
                          }`}
                          disabled={verifyingFindingId !== null}
                          onClick={() => onVerify(finding.id, "CONFIRMED")}
                          type="button"
                        >
                          {verifyingFindingId === finding.id ? "Saving..." : "Confirm Finding"}
                        </button>
                        <button
                          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                            finding.pilotVerification === "FALSE_POSITIVE"
                              ? "bg-rose-700 text-white"
                              : "border border-zinc-200 hover:bg-zinc-50 text-zinc-700"
                          }`}
                          disabled={verifyingFindingId !== null}
                          onClick={() => onVerify(finding.id, "FALSE_POSITIVE")}
                          type="button"
                        >
                          {verifyingFindingId === finding.id ? "Saving..." : "False Positive"}
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
