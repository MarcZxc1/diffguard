import { useEffect, useMemo, useState } from "react";
import {
  defaultGovernancePolicy,
  governanceSeverityWarning,
  type GovernancePolicy,
  type RuleConfiguration,
} from "../lib/governance-policy";

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
    [configuration?.governance],
  );
  const policySignature = JSON.stringify(policy);
  const [draft, setDraft] = useState(() => policyDraft(policy));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(policyDraft(policy));
    setSaved(false);
  }, [policySignature, policy]);

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
      setSaved(await onSave(draftPolicy));
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100";
  const controlsDisabled = disabled || saving;

  return (
    <form
      aria-busy={saving}
      className="rounded border border-slate-200 bg-white p-5"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Pull Request Governance</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Configure reusable review expectations without adding repository-specific knowledge to DiffGuard.
            Governance findings are advisory and can never fail the security enforcement gate.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            checked={draft.enabled}
            disabled={controlsDisabled}
            onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            type="checkbox"
          />
          Enable governance
        </label>
      </div>

      {configuration?.enabledRuleIds && draft.enabled && (
        <p className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
          Saving adds only the active governance checks to this repository&apos;s explicit rule allowlist.
        </p>
      )}
      {severityWarning && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          {severityWarning}
        </p>
      )}

      <fieldset disabled={controlsDisabled || !draft.enabled}>
        <legend className="sr-only">Governance requirements</legend>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium">
            Minimum description characters
            <input
              className={fieldClass}
              max={5000}
              min={0}
              onChange={(event) => setDraft((current) => ({ ...current, minimumDescriptionLength: event.target.value }))}
              type="number"
              value={draft.minimumDescriptionLength}
            />
            <span className="mt-1 block text-xs text-slate-500">Use 0 to disable this requirement.</span>
          </label>
          <label className="text-sm font-medium">
            Advisory changed-file limit
            <input
              className={fieldClass}
              max={3000}
              min={0}
              onChange={(event) => setDraft((current) => ({ ...current, maxChangedFiles: event.target.value }))}
              type="number"
              value={draft.maxChangedFiles}
            />
            <span className="mt-1 block text-xs text-slate-500">Use 0 for no size warning.</span>
          </label>
          <div className="space-y-3 pt-1 text-sm font-medium">
            <label className="flex items-center gap-2">
              <input
                checked={draft.requireIssueReference}
                onChange={(event) => setDraft((current) => ({ ...current, requireIssueReference: event.target.checked }))}
                type="checkbox"
              />
              Require an issue reference
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={draft.requireTestsForProtectedPaths}
                onChange={(event) => setDraft((current) => ({ ...current, requireTestsForProtectedPaths: event.target.checked }))}
                type="checkbox"
              />
              Require test changes for protected paths
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium">
            Required Markdown sections
            <textarea
              className={fieldClass}
              onChange={(event) => setDraft((current) => ({ ...current, requiredSections: event.target.value }))}
              placeholder={"Summary\nTesting\nRisk"}
              rows={6}
              value={draft.requiredSections}
            />
            <span className="mt-1 block text-xs text-slate-500">One heading name per line, without # characters.</span>
          </label>
          <label className="text-sm font-medium">
            Protected path patterns
            <textarea
              className={fieldClass}
              onChange={(event) => setDraft((current) => ({ ...current, protectedPaths: event.target.value }))}
              placeholder={"src/core/**\ninfrastructure/**"}
              rows={6}
              value={draft.protectedPaths}
            />
            <span className="mt-1 block text-xs text-slate-500">One repository-relative glob per line.</span>
          </label>
          <label className="text-sm font-medium">
            Test path patterns
            <textarea
              className={fieldClass}
              onChange={(event) => setDraft((current) => ({ ...current, testPaths: event.target.value }))}
              rows={6}
              value={draft.testPaths}
            />
            <span className="mt-1 block text-xs text-slate-500">A matching changed file satisfies protected-path test evidence.</span>
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="max-w-3xl text-xs text-slate-500">
          Pull-request title and description are evaluated transiently. DiffGuard stores only bounded policy findings,
          not the description itself.
        </p>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-semibold text-emerald-700" role="status">Governance saved.</span>}
          <button
            className="rounded bg-[#0f172a] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={controlsDisabled}
            type="submit"
          >
            {saving ? "Saving..." : "Save governance"}
          </button>
        </div>
      </div>
    </form>
  );
}
