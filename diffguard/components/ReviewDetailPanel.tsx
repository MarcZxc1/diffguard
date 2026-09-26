"use client";

import type { RefObject } from "react";
import type { ReviewRunDetail } from "@/types";

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
  if (status !== "loading" && !detail) return null;

  return (
    <section
      aria-busy={status === "loading"}
      aria-labelledby="review-detail-heading"
      className="rounded border border-slate-200 bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-lg font-black"
            id="review-detail-heading"
            ref={headingRef}
            tabIndex={-1}
          >
            Pilot Finding Verification
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {detail
              ? `PR #${detail.pullRequestNumber} · ${detail.headSha.slice(0, 8)}`
              : "Loading review findings..."}
          </p>
        </div>
        {detail && (
          <button className="rounded border px-3 py-1 text-xs font-semibold" onClick={onClose} type="button">
            Close
          </button>
        )}
      </div>
      {status === "loading" ? (
        <p className="mt-4 text-sm text-slate-600" role="status">Loading findings...</p>
      ) : detail?.findings.length === 0 ? (
        <p className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-600">
          This review run has no findings to classify.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {detail?.findings.map((finding) => (
            <article className="rounded border border-slate-200 p-4" key={finding.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{finding.title}</p>
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    {finding.filePath}:{finding.lineNumber} · {finding.ruleId}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">
                  {finding.severity} · {Math.round(finding.confidence * 100)}%
                </span>
              </div>
              <p className="mt-3 text-sm"><span className="font-semibold">Evidence:</span> {finding.evidence}</p>
              <p className="mt-2 text-sm text-slate-700">{finding.explanation}</p>
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-semibold">Remediation:</span> {finding.remediation}
              </p>
              {finding.suppressed ? (
                <p className="mt-3 rounded bg-slate-100 p-2 text-xs text-slate-600">
                  Suppressed: {finding.suppressionReason ?? "No reason recorded"}. Suppressed findings are excluded from pilot precision.
                </p>
              ) : finding.category !== "SECURITY" || finding.source !== "DETERMINISTIC" ? (
                <p className="mt-3 rounded bg-blue-50 p-2 text-xs text-blue-800">
                  This {finding.source.toLowerCase()} {finding.category.toLowerCase()} finding remains advisory and is excluded from the deterministic enforcement gate.
                </p>
              ) : (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-sm font-medium" htmlFor={`pilot-notes-${finding.id}`}>
                    Verification notes (optional)
                  </label>
                  <textarea
                    className="mt-1 min-h-20 w-full rounded border px-3 py-2 text-sm"
                    id={`pilot-notes-${finding.id}`}
                    maxLength={2000}
                    onChange={(event) => onNotesChange(finding.id, event.target.value)}
                    placeholder="Record the code-review evidence for this decision."
                    value={notes[finding.id] ?? ""}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={verifyingFindingId !== null}
                      onClick={() => onVerify(finding.id, "CONFIRMED")}
                      type="button"
                    >
                      {verifyingFindingId === finding.id ? "Saving..." : "Confirm finding"}
                    </button>
                    <button
                      className="rounded bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={verifyingFindingId !== null}
                      onClick={() => onVerify(finding.id, "FALSE_POSITIVE")}
                      type="button"
                    >
                      {verifyingFindingId === finding.id ? "Saving..." : "Mark false positive"}
                    </button>
                    {finding.pilotVerification && (
                      <span className="text-xs font-semibold text-slate-600">
                        Current: {finding.pilotVerification.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
