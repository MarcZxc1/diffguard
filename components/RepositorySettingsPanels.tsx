"use client";

import type {
  MaintainabilityPolicy,
  PathNamingConvention,
} from "@/lib/governance-policy";
import type { PilotStatus, Repository } from "@/types";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LockIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UnlockIcon,
} from "./Icons";

function NamingConventionOptions() {
  return (
    <>
      <option value="OFF">Off</option>
      <option value="KEBAB_CASE">kebab-case (e.g. auth-service.ts)</option>
      <option value="CAMEL_CASE">camelCase (e.g. authService.ts)</option>
      <option value="SNAKE_CASE">snake_case (e.g. auth_service.ts)</option>
    </>
  );
}

export function RepositorySettingsPanels({
  isSaving,
  isTestingAi,
  onCommitRetention,
  onMaintainabilityChange,
  onRepositoryChange,
  onRetentionDraftChange,
  onTestAi,
  pilotStatus,
  repository,
  retentionDraft,
}: {
  isSaving: boolean;
  isTestingAi: boolean;
  onCommitRetention: () => void;
  onMaintainabilityChange: (change: Partial<MaintainabilityPolicy>) => void;
  onRepositoryChange: (change: Partial<Repository>) => void;
  onRetentionDraftChange: (value: string) => void;
  onTestAi: () => void;
  pilotStatus: PilotStatus | null;
  repository: Repository;
  retentionDraft: string;
}) {
  const maintainabilityEnabled = repository.ruleConfiguration?.maintainability?.enabled ?? false;
  const isEnforcing = repository.checkRunMode === "ENFORCING";
  const canEnforce = pilotStatus?.canEnableEnforcing || isEnforcing;

  return (
    <div className="space-y-6">
      {/* Primary Repository Settings */}
      <section
        aria-labelledby="repository-settings-heading"
        className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900" id="repository-settings-heading">
                Repository Settings & Policy
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isEnforcing
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20"
                    : "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20"
                }`}
              >
                {isEnforcing ? (
                  <ShieldCheckIcon className="h-3 w-3" />
                ) : (
                  <LockIcon className="h-3 w-3" />
                )}
                {isEnforcing ? "Active Enforcing" : "Advisory Mode"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {repository.fullName} · Retention: {repository.retentionDays} days · Draft PRs:{" "}
              {repository.draftPullRequestPolicy}
            </p>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition">
            <input
              checked={repository.llmReviewEnabled}
              className="rounded text-indigo-600 focus:ring-indigo-500"
              disabled={isSaving}
              onChange={(event) => onRepositoryChange({ llmReviewEnabled: event.target.checked })}
              type="checkbox"
            />
            <SparklesIcon className="h-3.5 w-3.5 text-indigo-600" />
            Enable LLM Review (AI findings)
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Draft Pull Requests */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Draft PR Policy
            </label>
            <select
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden disabled:opacity-50"
              disabled={isSaving}
              onChange={(event) =>
                onRepositoryChange({
                  draftPullRequestPolicy: event.target.value as Repository["draftPullRequestPolicy"],
                })
              }
              value={repository.draftPullRequestPolicy}
            >
              <option value="SKIP">Skip analysis on draft PRs</option>
              <option value="ANALYZE">Analyze draft PRs</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              Save CI worker credits by skipping draft pull requests.
            </p>
          </div>

          {/* Check Runs Mode */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Check Runs Mode
              </label>
              {canEnforce ? (
                <span title="Enforcement Unlocked">
                  <UnlockIcon className="h-3.5 w-3.5 text-emerald-600" />
                </span>
              ) : (
                <span title="Locked by Pilot Gate">
                  <LockIcon className="h-3.5 w-3.5 text-amber-600" />
                </span>
              )}
            </div>
            <select
              className={`mt-2 w-full rounded-md border px-3 py-2 text-xs font-semibold transition focus:outline-hidden ${
                canEnforce
                  ? "border-emerald-300 bg-white text-slate-800 focus:border-emerald-500"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
              disabled={isSaving}
              onChange={(event) =>
                onRepositoryChange({
                  checkRunMode: event.target.value as Repository["checkRunMode"],
                })
              }
              value={repository.checkRunMode}
            >
              <option value="ADVISORY">Advisory (Comments only)</option>
              <option disabled={!canEnforce} value="ENFORCING">
                Enforcing (Block failing PRs)
                {pilotStatus?.developmentBypass.active ? " (bypass active)" : ""}
              </option>
            </select>
            {!canEnforce ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                <AlertCircleIcon className="h-3 w-3 shrink-0" />
                Locked until Pilot Gate requirements are met.
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <CheckCircleIcon className="h-3 w-3 shrink-0" />
                Ready to enforce verified rules.
              </p>
            )}
          </div>

          {/* Retention Controls */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Retention Days
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden disabled:opacity-50"
                disabled={isSaving}
                max={365}
                min={7}
                onBlur={onCommitRetention}
                onChange={(event) => onRetentionDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                type="number"
                value={retentionDraft}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Reviews older than this are automatically pruned (7-365 days).
            </p>
          </div>

          {/* AI Review Health Check */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              AI Diagnostic
            </label>
            <button
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-900 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isTestingAi || isSaving}
              onClick={onTestAi}
              type="button"
            >
              <SparklesIcon className={`h-3.5 w-3.5 text-indigo-600 ${isTestingAi ? "animate-spin" : ""}`} />
              {isTestingAi ? "Testing model..." : "Test AI Review"}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Verifies OpenAI connectivity and structured review schema.
            </p>
          </div>
        </div>
      </section>

      {/* Maintainability Policies */}
      <section
        aria-labelledby="maintainability-heading"
        className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900" id="maintainability-heading">
              Code & Path Maintainability Policy
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Optional architectural and path conventions. Always advisory; never blocks security gates.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition">
            <input
              checked={maintainabilityEnabled}
              className="rounded text-slate-900 focus:ring-slate-900"
              disabled={isSaving}
              onChange={(event) => onMaintainabilityChange({ enabled: event.target.checked })}
              type="checkbox"
            />
            Enable naming checks
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Identifier Naming
            </label>
            <select
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(event) =>
                onMaintainabilityChange({
                  identifierNaming: event.target.value as MaintainabilityPolicy["identifierNaming"],
                })
              }
              value={repository.ruleConfiguration?.maintainability?.identifierNaming ?? "CAMEL_PASCAL"}
            >
              <option value="OFF">Disabled</option>
              <option value="CAMEL_PASCAL">camelCase variables / PascalCase types</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              File Path Convention
            </label>
            <select
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(event) =>
                onMaintainabilityChange({
                  fileNaming: event.target.value as PathNamingConvention,
                })
              }
              value={repository.ruleConfiguration?.maintainability?.fileNaming ?? "OFF"}
            >
              <NamingConventionOptions />
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Directory Convention
            </label>
            <select
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(event) =>
                onMaintainabilityChange({
                  folderNaming: event.target.value as PathNamingConvention,
                })
              }
              value={repository.ruleConfiguration?.maintainability?.folderNaming ?? "OFF"}
            >
              <NamingConventionOptions />
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
