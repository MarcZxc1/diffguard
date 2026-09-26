"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultGovernancePolicy,
  governanceSeverityWarning,
  type GovernancePolicy,
  type RuleConfiguration,
} from "@/lib/governance-policy";
import { CheckCircleIcon, SparklesIcon } from "./Icons";

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function policyDraft(policy: GovernancePolicy) {
  return {
    enabled: policy.enabled,
    minimumDescriptionLength: String(policy.minimumDescriptionLength),
    requiredSections: policy.requiredSections.join("\n"),
    requireIssueReference: policy.requireIssueReference,
    maxChangedFiles: String(policy.maxChangedFiles),
    protectedPaths: policy.protectedPaths.join("\n"),
    requireTestsForProtectedPaths: policy.requireTestsForProtectedPaths,
    testPaths: policy.testPaths.join("\n"),
  };
}

export function GovernancePolicySettings({
  configuration,
  disabled = false,
  onSave,
}: {
  configuration?: RuleConfiguration;
  disabled?: boolean;
  onSave: (policy: GovernancePolicy) => Promise<boolean>;
}) {
  const policy = useMemo(
    () => ({ ...defaultGovernancePolicy, ...configuration?.governance }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(configuration?.governance)]
  );

  const policySignature = useMemo(() => JSON.stringify(policy), [policy]);
  const [draft, setDraft] = useState(() => policyDraft(policy));
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const lastSavedSignatureRef = useRef(policySignature);

  // Sync incoming props only if the user hasn't made unsaved local edits
  useEffect(() => {
    if (!isDirty && policySignature !== lastSavedSignatureRef.current) {
      setDraft(policyDraft(policy));
      lastSavedSignatureRef.current = policySignature;
      setSaved(false);
    }
  }, [policySignature, policy, isDirty]);

  const draftPolicy: GovernancePolicy = {
    enabled: draft.enabled,
    minimumDescriptionLength: Number(draft.minimumDescriptionLength || 0),
    requiredSections: lines(draft.requiredSections),
    requireIssueReference: draft.requireIssueReference,
    maxChangedFiles: Number(draft.maxChangedFiles || 0),
    protectedPaths: lines(draft.protectedPaths),
    requireTestsForProtectedPaths: draft.requireTestsForProtectedPaths,
    testPaths: lines(draft.testPaths),
  };

  const severityWarning = governanceSeverityWarning(configuration, draftPolicy);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const ok = await onSave(draftPolicy);
      if (ok) {
        setIsDirty(false);
        lastSavedSignatureRef.current = JSON.stringify(draftPolicy);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(policyDraft(policy));
    setIsDirty(false);
    setSaved(false);
  }

  const fieldClass =
    "mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400";
  const controlsDisabled = disabled || saving;

  return (
    <form
      aria-busy={saving}
      className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Pull Request Governance Standards</h2>
            {isDirty && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Unsaved Edits
              </span>
            )}
          </div>
          <p className="mt-0.5 max-w-3xl text-xs text-slate-500">
            Define organizational expectations for PR descriptions, issue links, file limits, and test coverage.
            Governance checks are advisory.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition">
          <input
            checked={draft.enabled}
            className="rounded text-slate-900 focus:ring-slate-900"
            disabled={controlsDisabled}
            onChange={(event) => {
              setIsDirty(true);
              setDraft((current) => ({ ...current, enabled: event.target.checked }));
            }}
            type="checkbox"
          />
          Enable governance policy
        </label>
      </div>

      {configuration?.enabledRuleIds && draft.enabled && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
          Saving adds active governance checks to this repository&apos;s explicit rule allowlist.
        </div>
      )}

      {severityWarning && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {severityWarning}
        </div>
      )}

      <fieldset disabled={controlsDisabled || !draft.enabled}>
        <legend className="sr-only">Governance requirements</legend>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Min. Description Chars
            </label>
            <input
              className={fieldClass}
              max={5000}
              min={0}
              onChange={(event) => {
                setIsDirty(true);
                setDraft((current) => ({
                  ...current,
                  minimumDescriptionLength: event.target.value,
                }));
              }}
              type="number"
              value={draft.minimumDescriptionLength}
            />
            <span className="mt-1 block text-[11px] text-slate-400">0 disables this check.</span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Changed-File Warning Limit
            </label>
            <input
              className={fieldClass}
              max={3000}
              min={0}
              onChange={(event) => {
                setIsDirty(true);
                setDraft((current) => ({
                  ...current,
                  maxChangedFiles: event.target.value,
                }));
              }}
              type="number"
              value={draft.maxChangedFiles}
            />
            <span className="mt-1 block text-[11px] text-slate-400">0 disables file limit warnings.</span>
          </div>

          <div className="space-y-2 pt-5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                checked={draft.requireIssueReference}
                className="rounded text-slate-900 focus:ring-slate-900"
                onChange={(event) => {
                  setIsDirty(true);
                  setDraft((current) => ({
                    ...current,
                    requireIssueReference: event.target.checked,
                  }));
                }}
                type="checkbox"
              />
              Require linked issue (#123)
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                checked={draft.requireTestsForProtectedPaths}
                className="rounded text-slate-900 focus:ring-slate-900"
                onChange={(event) => {
                  setIsDirty(true);
                  setDraft((current) => ({
                    ...current,
                    requireTestsForProtectedPaths: event.target.checked,
                  }));
                }}
                type="checkbox"
              />
              Require tests for protected paths
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Required Markdown Headings
            </label>
            <textarea
              className={fieldClass}
              onChange={(event) => {
                setIsDirty(true);
                setDraft((current) => ({ ...current, requiredSections: event.target.value }));
              }}
              placeholder={"Summary\nTesting\nRollout Risk"}
              rows={5}
              value={draft.requiredSections}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              One heading per line (without # characters).
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Protected Path Globs
            </label>
            <textarea
              className={fieldClass}
              onChange={(event) => {
                setIsDirty(true);
                setDraft((current) => ({ ...current, protectedPaths: event.target.value }));
              }}
              placeholder={"src/core/**\nservices/auth/**"}
              rows={5}
              value={draft.protectedPaths}
            />
            <span className="mt-1 block text-[11px] text-slate-400">One relative glob per line.</span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Test Path Globs
            </label>
            <textarea
              className={fieldClass}
              onChange={(event) => {
                setIsDirty(true);
                setDraft((current) => ({ ...current, testPaths: event.target.value }));
              }}
              placeholder={"tests/**\n**/*.test.ts"}
              rows={5}
              value={draft.testPaths}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Matching changed files satisfy protected path test requirements.
            </span>
          </div>
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="max-w-2xl text-[11px] text-slate-400">
          Descriptions and PR bodies are analyzed transiently in memory. DiffGuard never stores pull request text.
        </p>
        <div className="flex items-center gap-3">
          {saved && !isDirty && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700" role="status">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Governance saved
            </span>
          )}
          {isDirty && (
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              disabled={controlsDisabled}
              onClick={handleReset}
              type="button"
            >
              Discard Changes
            </button>
          )}
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-800 focus:ring-2 focus:ring-slate-900 focus:outline-hidden disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={controlsDisabled || !isDirty}
            type="submit"
          >
            {saving ? "Saving..." : "Save Governance"}
          </button>
        </div>
      </div>
    </form>
  );
}
