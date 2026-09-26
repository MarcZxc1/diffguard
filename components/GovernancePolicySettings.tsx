"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultGovernancePolicy,
  governanceSeverityWarning,
  type GovernancePolicy,
  type RuleConfiguration,
} from "@/lib/governance-policy";

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
    "mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-hidden disabled:bg-zinc-50 disabled:text-zinc-400";
  const controlsDisabled = disabled || saving;

  return (
    <form
      aria-busy={saving}
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">PR Governance Standards</h2>
            {isDirty && (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                Unsaved changes
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Enforce PR description length, required sections, issue links, and test changes.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
          <input
            checked={draft.enabled}
            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            disabled={controlsDisabled}
            onChange={(event) => {
              setIsDirty(true);
              setDraft((current) => ({ ...current, enabled: event.target.checked }));
            }}
            type="checkbox"
          />
          Enable governance
        </label>
      </div>

      {severityWarning && (
        <div className="rounded border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-900">
          {severityWarning}
        </div>
      )}

      <fieldset disabled={controlsDisabled || !draft.enabled}>
        <legend className="sr-only">Governance requirements</legend>
        <div className="grid gap-4 sm:grid-cols-3 text-xs">
          <div>
            <label className="block font-medium text-zinc-700">Min. Description Length</label>
            <input
              className={fieldClass}
              max={5000}
              min={0}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((c) => ({ ...c, minimumDescriptionLength: e.target.value }));
              }}
              type="number"
              value={draft.minimumDescriptionLength}
            />
            <span className="text-[11px] text-zinc-400 mt-0.5 block">0 to disable.</span>
          </div>

          <div>
            <label className="block font-medium text-zinc-700">Max Changed Files Limit</label>
            <input
              className={fieldClass}
              max={3000}
              min={0}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((c) => ({ ...c, maxChangedFiles: e.target.value }));
              }}
              type="number"
              value={draft.maxChangedFiles}
            />
            <span className="text-[11px] text-zinc-400 mt-0.5 block">0 for no limit.</span>
          </div>

          <div className="space-y-2 pt-4">
            <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                checked={draft.requireIssueReference}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                onChange={(e) => {
                  setIsDirty(true);
                  setDraft((c) => ({ ...c, requireIssueReference: e.target.checked }));
                }}
                type="checkbox"
              />
              Require issue reference (#123)
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                checked={draft.requireTestsForProtectedPaths}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                onChange={(e) => {
                  setIsDirty(true);
                  setDraft((c) => ({ ...c, requireTestsForProtectedPaths: e.target.checked }));
                }}
                type="checkbox"
              />
              Require tests for protected paths
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mt-4 text-xs">
          <div>
            <label className="block font-medium text-zinc-700">Required Headings</label>
            <textarea
              className={fieldClass}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((c) => ({ ...c, requiredSections: e.target.value }));
              }}
              placeholder={"Summary\nTesting\nRollout"}
              rows={4}
              value={draft.requiredSections}
            />
            <span className="text-[11px] text-zinc-400 mt-0.5 block">One heading per line.</span>
          </div>

          <div>
            <label className="block font-medium text-zinc-700">Protected Paths</label>
            <textarea
              className={fieldClass}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((c) => ({ ...c, protectedPaths: e.target.value }));
              }}
              placeholder={"src/core/**\nservices/**"}
              rows={4}
              value={draft.protectedPaths}
            />
            <span className="text-[11px] text-zinc-400 mt-0.5 block">Glob patterns.</span>
          </div>

          <div>
            <label className="block font-medium text-zinc-700">Test Paths</label>
            <textarea
              className={fieldClass}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((c) => ({ ...c, testPaths: e.target.value }));
              }}
              placeholder={"tests/**\n**/*.test.ts"}
              rows={4}
              value={draft.testPaths}
            />
            <span className="text-[11px] text-zinc-400 mt-0.5 block">Test glob patterns.</span>
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
        <span className="text-[11px] text-zinc-400">
          Governance rules are advisory and evaluated in memory.
        </span>
        <div className="flex items-center gap-2">
          {saved && !isDirty && (
            <span className="text-xs text-emerald-600 font-medium">Saved</span>
          )}
          {isDirty && (
            <button
              className="text-xs text-zinc-500 hover:text-zinc-800 transition"
              disabled={controlsDisabled}
              onClick={handleReset}
              type="button"
            >
              Reset
            </button>
          )}
          <button
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 transition disabled:opacity-50"
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
