import type {
  MaintainabilityPolicy,
  PathNamingConvention,
} from "../lib/governance-policy";
import type { PilotStatus, Repository } from "../types";

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

  return (
    <>
      <section aria-labelledby="repository-settings-heading" className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-all text-xl font-black" id="repository-settings-heading">{repository.fullName}</h2>
            <p className="text-sm text-slate-600">
              Check mode: {repository.checkRunMode} · Drafts: {repository.draftPullRequestPolicy}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              checked={repository.llmReviewEnabled}
              disabled={isSaving}
              onChange={(event) => onRepositoryChange({ llmReviewEnabled: event.target.checked })}
              type="checkbox"
            />
            LLM review
          </label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium">
            Draft PRs
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              disabled={isSaving}
              onChange={(event) => onRepositoryChange({
                draftPullRequestPolicy: event.target.value as Repository["draftPullRequestPolicy"],
              })}
              value={repository.draftPullRequestPolicy}
            >
              <option value="SKIP">Skip</option>
              <option value="ANALYZE">Analyze</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Check Runs
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              disabled={isSaving}
              onChange={(event) => onRepositoryChange({
                checkRunMode: event.target.value as Repository["checkRunMode"],
              })}
              value={repository.checkRunMode}
            >
              <option value="ADVISORY">Advisory</option>
              <option
                disabled={!pilotStatus?.canEnableEnforcing && repository.checkRunMode !== "ENFORCING"}
                value="ENFORCING"
              >
                Enforcing{pilotStatus?.developmentBypass.active ? " (development bypass)" : ""}
              </option>
            </select>
            {!pilotStatus?.canEnableEnforcing && repository.checkRunMode === "ADVISORY" && (
              <span className="mt-1 block text-xs text-amber-700">Locked until pilot targets are met</span>
            )}
            {pilotStatus?.developmentBypass.active && repository.checkRunMode === "ADVISORY" && (
              <span className="mt-1 block text-xs text-orange-700">
                Development bypass permits enforcing while pilot evidence is still collecting
              </span>
            )}
          </label>
          <label className="text-sm font-medium">
            Retention days
            <input
              className="mt-1 w-full rounded border px-3 py-2"
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
          </label>
          <div className="text-sm font-medium">
            AI health
            <button
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              disabled={isTestingAi || isSaving}
              onClick={onTestAi}
              type="button"
            >
              {isTestingAi ? "Testing..." : "Test AI Review"}
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="maintainability-heading" className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black" id="maintainability-heading">Maintainability Policies</h2>
            <p className="mt-1 text-sm text-slate-600">
              Optional naming checks are advisory and never participate in the security enforcement gate.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              checked={maintainabilityEnabled}
              disabled={isSaving}
              onChange={(event) => onMaintainabilityChange({ enabled: event.target.checked })}
              type="checkbox"
            />
            Enable naming policies
          </label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Identifiers
            <select
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(event) => onMaintainabilityChange({
                identifierNaming: event.target.value as MaintainabilityPolicy["identifierNaming"],
              })}
              value={repository.ruleConfiguration?.maintainability?.identifierNaming ?? "CAMEL_PASCAL"}
            >
              <option value="OFF">Off</option>
              <option value="CAMEL_PASCAL">camelCase / PascalCase</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            New files
            <select
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(event) => onMaintainabilityChange({
                fileNaming: event.target.value as PathNamingConvention,
              })}
              value={repository.ruleConfiguration?.maintainability?.fileNaming ?? "OFF"}
            >
              <NamingConventionOptions />
            </select>
          </label>
          <label className="text-sm font-medium">
            New folders
            <select
              className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
              disabled={isSaving || !maintainabilityEnabled}
              onChange={(event) => onMaintainabilityChange({
                folderNaming: event.target.value as PathNamingConvention,
              })}
              value={repository.ruleConfiguration?.maintainability?.folderNaming ?? "OFF"}
            >
              <NamingConventionOptions />
            </select>
          </label>
        </div>
      </section>
    </>
  );
}
