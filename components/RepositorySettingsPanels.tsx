"use client";

import type {
  MaintainabilityPolicy,
  PathNamingConvention,
} from "@/lib/governance-policy";
import type { PilotStatus, Repository } from "@/types";

function NamingConventionOptions() {
  return (
    <>
      <option value="OFF">Off</option>
      <option value="KEBAB_CASE">kebab-case</option>
      <option value="CAMEL_CASE">camelCase</option>
      <option value="SNAKE_CASE">snake_case</option>
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
        className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900" id="repository-settings-heading">
              Repository Settings
            </h2>
            <p className="text-xs text-zinc-500">Configure check behavior and data retention.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
            <input
              checked={repository.llmReviewEnabled}
              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              disabled={isSaving}
              onChange={(e) => onRepositoryChange({ llmReviewEnabled: e.target.checked })}
              type="checkbox"
            />
            LLM Review (gpt-5.6-sol)
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          {/* Draft PR Policy */}
          <div>
            <label className="block font-medium text-zinc-700">Draft Pull Requests</label>
            <select
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden disabled:opacity-50"
              disabled={isSaving}
              onChange={(e) =>
                onRepositoryChange({
                  draftPullRequestPolicy: e.target.value as Repository["draftPullRequestPolicy"],
                })
              }
              value={repository.draftPullRequestPolicy}
            >
              <option value="SKIP">Skip analysis</option>
              <option value="ANALYZE">Analyze drafts</option>
            </select>
          </div>

          {/* Check Runs Mode */}
          <div>
            <label className="block font-medium text-zinc-700">Check Runs Mode</label>
            <select
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden disabled:opacity-50"
              disabled={isSaving}
              onChange={(e) =>
                onRepositoryChange({
                  checkRunMode: e.target.value as Repository["checkRunMode"],
                })
              }
              value={repository.checkRunMode}
            >
              <option value="ADVISORY">Advisory (Comments only)</option>
              <option disabled={!canEnforce} value="ENFORCING">
                Enforcing (Block failing PRs)
              </option>
            </select>
            {!canEnforce && (
              <p className="mt-1 text-[11px] text-zinc-400">Locked until pilot targets are met.</p>
            )}
          </div>

          {/* Retention Days */}
          <div>
            <label className="block font-medium text-zinc-700">Retention Days</label>
            <input
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden disabled:opacity-50"
              disabled={isSaving}
              max={365}
              min={7}
              onBlur={onCommitRetention}
              onChange={(e) => onRetentionDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              type="number"
              value={retentionDraft}
            />
            <p className="mt-1 text-[11px] text-zinc-400">7 to 365 days.</p>
          </div>

          {/* AI Health Test */}
          <div>
            <label className="block font-medium text-zinc-700">AI Health Diagnostic</label>
            <button
              className="mt-1.5 w-full rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-50"
              disabled={isTestingAi || isSaving}
              onClick={onTestAi}
              type="button"
            >
              {isTestingAi ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>
      </section>

      {/* Maintainability Policies */}
      <section
        aria-labelledby="maintainability-heading"
        className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900" id="maintainability-heading">
              Naming & Maintainability Conventions
            </h2>
            <p className="text-xs text-zinc-500">Advisory path and identifier style checks.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
            <input
              checked={maintainabilityEnabled}
              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              disabled={isSaving}
              onChange={(e) => onMaintainabilityChange({ enabled: e.target.checked })}
              type="checkbox"
            />
            Enable checks
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 text-xs">
          <div>
            <label className="block font-medium text-zinc-700">Identifiers</label>
            <select
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden disabled:bg-zinc-50 disabled:text-zinc-400"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(e) =>
                onMaintainabilityChange({
                  identifierNaming: e.target.value as MaintainabilityPolicy["identifierNaming"],
                })
              }
              value={repository.ruleConfiguration?.maintainability?.identifierNaming ?? "CAMEL_PASCAL"}
            >
              <option value="OFF">Disabled</option>
              <option value="CAMEL_PASCAL">camelCase / PascalCase</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-zinc-700">File Names</label>
            <select
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden disabled:bg-zinc-50 disabled:text-zinc-400"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(e) =>
                onMaintainabilityChange({
                  fileNaming: e.target.value as PathNamingConvention,
                })
              }
              value={repository.ruleConfiguration?.maintainability?.fileNaming ?? "OFF"}
            >
              <NamingConventionOptions />
            </select>
          </div>

          <div>
            <label className="block font-medium text-zinc-700">Folder Names</label>
            <select
              className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-hidden disabled:bg-zinc-50 disabled:text-zinc-400"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(e) =>
                onMaintainabilityChange({
                  folderNaming: e.target.value as PathNamingConvention,
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
