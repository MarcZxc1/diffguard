"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EvidenceExportPanel } from "@/components/EvidenceExportPanel";
import { GovernancePolicySettings } from "@/components/GovernancePolicySettings";
import { RepositorySidebar } from "@/components/RepositorySidebar";
import { RepositorySettingsPanels } from "@/components/RepositorySettingsPanels";
import { ReviewDetailPanel } from "@/components/ReviewDetailPanel";
import { ReviewRunsTable } from "@/components/ReviewRunsTable";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  GithubIcon,
  ShieldIcon,
  ShieldCheckIcon,
} from "@/components/Icons";
import {
  ApiError,
  SESSION_EXPIRED_EVENT,
  api,
  apiPath,
  errorMessageFromResponse,
  readJsonResponse,
} from "@/lib/api";
import {
  configurationWithGovernance,
  type GovernancePolicy,
  type MaintainabilityPolicy,
} from "@/lib/governance-policy";
import { uniquePullRequestRuns } from "@/lib/review-runs";
import type {
  AiReviewTestResult,
  DiscoveredRepository,
  EvidencePreview,
  Metrics,
  PilotStatus,
  Repository,
  ReviewRunDetail,
  RulePrecision,
} from "@/types";

type Toast = {
  id: number;
  tone: "success" | "error";
  message: string;
};

const defaultMaintainabilityPolicy: MaintainabilityPolicy = {
  enabled: false,
  identifierNaming: "CAMEL_PASCAL",
  fileNaming: "OFF",
  folderNaming: "OFF",
};

export default function Dashboard() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Repository | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [evidenceContext, setEvidenceContext] = useState("");
  const [preview, setPreview] = useState<EvidencePreview | null>(null);
  const [pilotPrecision, setPilotPrecision] = useState<RulePrecision[]>([]);
  const [pilotStatus, setPilotStatus] = useState<PilotStatus | null>(null);
  const [reviewDetail, setReviewDetail] = useState<ReviewRunDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [verificationNotes, setVerificationNotes] = useState<Record<string, string>>({});
  const [verifyingFindingId, setVerifyingFindingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isTestingAiReview, setIsTestingAiReview] = useState(false);
  const [githubReauthRequired, setGithubReauthRequired] = useState(false);
  const [isReconnectingGithub, setIsReconnectingGithub] = useState(false);
  const [repositorySyncState, setRepositorySyncState] = useState<"idle" | "refreshing" | "stale">("idle");
  const [lastRepositoryRefreshAt, setLastRepositoryRefreshAt] = useState<Date | null>(null);
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepository[] | null>(null);
  const [discoveryFilter, setDiscoveryFilter] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [retentionDraft, setRetentionDraft] = useState("");
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: string } | null>(null);

  const retentionDraftDirtyRef = useRef(false);
  const repositoryRequestRef = useRef<AbortController | null>(null);
  const repositoryRequestSequenceRef = useRef(0);
  const settingsSavingRef = useRef(false);
  const selectedRef = useRef<Repository | null>(null);
  const reviewDetailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const reviewDetailReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  const hasActiveReviewRuns = Boolean(
    selected?.reviewRuns?.some((run) => run.state === "QUEUED" || run.state === "PROCESSING")
  );

  const showToast = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now();
    setToast({ id, tone, message });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3500);
  }, []);

  const clearRepositoryState = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
    setMetrics(null);
    setPilotPrecision([]);
    setPilotStatus(null);
    setReviewDetail(null);
    setDetailStatus("idle");
    setVerificationNotes({});
    setRepositorySyncState("idle");
    setLastRepositoryRefreshAt(null);
    setPreview(null);
  }, []);

  const loadRepositories = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const data = await api<Repository[]>("api/repositories");
      setRepositories(data);
      setSelectedId((current) =>
        current && data.some((repository) => repository.id === current)
          ? current
          : data[0]?.id ?? null
      );
      setStatus("idle");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.code === "GITHUB_REAUTH_REQUIRED") {
        setGithubReauthRequired(true);
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load repositories");
    }
  }, []);

  const loadRepository = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      repositoryRequestRef.current?.abort();
      const controller = new AbortController();
      const requestSequence = ++repositoryRequestSequenceRef.current;
      repositoryRequestRef.current = controller;
      if (!options?.silent) setError("");
      if (options?.silent) setRepositorySyncState("refreshing");
      try {
        const [repository, metricData, pilotData] = await Promise.all([
          api<Repository>(`api/repositories/${id}`, { signal: controller.signal }),
          api<Metrics>(`api/repositories/${id}/metrics`, { signal: controller.signal }),
          api<PilotStatus>(`api/repositories/${id}/pilot/status`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted || requestSequence !== repositoryRequestSequenceRef.current) return;
        selectedRef.current = repository;
        setSelected(repository);
        setMetrics(metricData);
        setPilotPrecision(pilotData.rules);
        setPilotStatus(pilotData);
        setRepositorySyncState("idle");
        setLastRepositoryRefreshAt(new Date());

        if (!retentionDraftDirtyRef.current) {
          setRetentionDraft(String(repository.retentionDays));
        }
      } catch (err) {
        if (controller.signal.aborted || requestSequence !== repositoryRequestSequenceRef.current) return;
        if (err instanceof ApiError && err.status === 401) return;
        if (options?.silent) {
          setRepositorySyncState("stale");
        } else {
          clearRepositoryState();
          setError(err instanceof Error ? err.message : "Unable to load repository");
        }
      }
    },
    [clearRepositoryState]
  );

  useEffect(() => {
    const expireSession = () => {
      repositoryRequestRef.current?.abort();
      clearRepositoryState();
      setRepositories([]);
      setSelectedId(null);
      setDiscoveredRepos(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    void loadRepositories();
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [clearRepositoryState, loadRepositories]);

  useEffect(() => {
    async function checkUser() {
      try {
        const data = await api<{ user: { id: string; email?: string; role: string; githubConnected?: boolean } }>(
          "api/users/me",
          { handleUnauthorized: false }
        );
        if (data?.user) {
          setCurrentUser({
            id: data.user.id,
            email: data.user.email ?? "authorized user",
            role: data.user.role,
          });
          if (data.user.githubConnected === false) {
            setGithubReauthRequired(true);
          }
        }
      } catch {
        // ignore
      }
    }
    void checkUser();
  }, []);

  useEffect(() => {
    clearRepositoryState();
    retentionDraftDirtyRef.current = false;
    if (!selectedId) return;
    void loadRepository(selectedId);
    return () => {
      repositoryRequestRef.current?.abort();
      repositoryRequestSequenceRef.current += 1;
    };
  }, [clearRepositoryState, loadRepository, selectedId]);

  useEffect(() => {
    if (!selectedId || discoveredRepos) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const pollInterval = hasActiveReviewRuns ? 3000 : 20000;

    const poll = async () => {
      await loadRepository(selectedId, { silent: true });
      if (!cancelled) timeoutId = window.setTimeout(poll, pollInterval);
    };

    timeoutId = window.setTimeout(poll, pollInterval);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [selectedId, discoveredRepos, hasActiveReviewRuns, loadRepository]);

  useEffect(() => {
    selectedRef.current = selected;
    if (!selected) return;
    const options = uniquePullRequestRuns(selected.reviewRuns);
    if (options.length > 0 && !options.some((run) => String(run.pullRequestNumber) === prNumber)) {
      setPrNumber(String(options[0].pullRequestNumber));
      setPreview(null);
    }
  }, [selected, prNumber]);

  useEffect(() => {
    if (reviewDetail) reviewDetailHeadingRef.current?.focus();
  }, [reviewDetail]);

  async function discoverGithubRepositories() {
    setStatus("loading");
    setError("");
    try {
      const data = await api<DiscoveredRepository[]>("api/repositories/github/discover", {
        handleUnauthorized: false,
      });
      setDiscoveredRepos(data);
      setStatus("idle");
    } catch (err) {
      if (err instanceof ApiError && (err.code === "GITHUB_REAUTH_REQUIRED" || err.status === 401)) {
        setGithubReauthRequired(true);
        setStatus("idle");
        return;
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to discover repositories");
    }
  }

  async function connectGithubRepository(githubRepositoryId: number) {
    try {
      setError("");
      await api<{ success: boolean; repositoryId: string }>("api/repositories/github/connect", {
        method: "POST",
        body: JSON.stringify({ githubRepositoryId }),
        handleUnauthorized: false,
      });
      await loadRepositories();
      setDiscoveredRepos(null);
      showToast("success", "Repository connected");
    } catch (err) {
      if (err instanceof ApiError && (err.code === "GITHUB_REAUTH_REQUIRED" || err.status === 401)) {
        setGithubReauthRequired(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to connect repository");
    }
  }

  async function reconnectGithub() {
    if (isReconnectingGithub) return;
    setIsReconnectingGithub(true);
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "read:user user:email repo",
        },
      });
    } catch (err) {
      setIsReconnectingGithub(false);
      setError(err instanceof Error ? err.message : "Unable to reconnect GitHub");
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  const updateSettings = useCallback(async (next: Partial<Repository>) => {
    const repository = selectedRef.current;
    if (!repository || settingsSavingRef.current) return false;
    settingsSavingRef.current = true;
    setIsSavingSettings(true);
    try {
      setError("");
      const updated = await api<Repository>(`api/repositories/${repository.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setSelected((current) => {
        if (!current || current.id !== updated.id) return current;
        const merged = {
          ...current,
          ...updated,
          reviewRuns: updated.reviewRuns ?? current.reviewRuns,
        };
        selectedRef.current = merged;
        return merged;
      });
      setRepositories((items) =>
        items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      showToast("success", "Settings updated");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update settings");
      showToast("error", err instanceof Error ? err.message : "Update failed");
      return false;
    } finally {
      settingsSavingRef.current = false;
      setIsSavingSettings(false);
    }
  }, [showToast]);

  async function commitRetention() {
    const repository = selectedRef.current;
    if (!repository) return;
    const days = Number(retentionDraft);
    if (!Number.isInteger(days) || days < 7 || days > 365) {
      setRetentionDraft(String(repository.retentionDays));
      retentionDraftDirtyRef.current = false;
      setError("Retention days must be between 7 and 365.");
      return;
    }
    if (days === repository.retentionDays) {
      retentionDraftDirtyRef.current = false;
      return;
    }
    const saved = await updateSettings({ retentionDays: days });
    if (saved) {
      retentionDraftDirtyRef.current = false;
    } else {
      setRetentionDraft(String(selectedRef.current?.retentionDays ?? repository.retentionDays));
      retentionDraftDirtyRef.current = false;
    }
  }

  async function updateMaintainabilityPolicy(next: Partial<MaintainabilityPolicy>) {
    const repository = selectedRef.current;
    if (!repository) return false;
    return updateSettings({
      ruleConfiguration: {
        ...repository.ruleConfiguration,
        maintainability: {
          ...defaultMaintainabilityPolicy,
          ...repository.ruleConfiguration?.maintainability,
          ...next,
        },
      },
    });
  }

  async function updateGovernancePolicy(governance: GovernancePolicy) {
    const repository = selectedRef.current;
    if (!repository) return false;
    return updateSettings({
      ruleConfiguration: configurationWithGovernance(
        repository.ruleConfiguration,
        governance
      ),
    });
  }

  async function rerun(id: string) {
    const repository = selectedRef.current;
    if (!repository) return;
    try {
      setError("");
      await api(`api/review-runs/${id}/rerun`, { method: "POST" });
      showToast("success", "Review rerun queued");
      await loadRepository(repository.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rerun review");
      showToast("error", "Unable to rerun review");
    }
  }

  async function inspectReviewRun(id: string, returnFocus?: HTMLButtonElement) {
    if (returnFocus) reviewDetailReturnFocusRef.current = returnFocus;
    setDetailStatus("loading");
    try {
      const detail = await api<ReviewRunDetail>(`api/review-runs/${id}`);
      setReviewDetail(detail);
      setVerificationNotes(
        Object.fromEntries(detail.findings.map((finding) => [finding.id, finding.pilotNotes ?? ""]))
      );
      setDetailStatus("idle");
    } catch (err) {
      setDetailStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load review findings");
    }
  }

  function closeReviewDetail() {
    setReviewDetail(null);
    setDetailStatus("idle");
    window.requestAnimationFrame(() => reviewDetailReturnFocusRef.current?.focus());
  }

  async function verifyPilotFinding(
    findingId: string,
    verification: "CONFIRMED" | "FALSE_POSITIVE"
  ) {
    const repository = selectedRef.current;
    if (!repository || !reviewDetail || verifyingFindingId) return;
    setVerifyingFindingId(findingId);
    try {
      await api(`api/repositories/${repository.id}/findings/${findingId}/verify`, {
        method: "PATCH",
        body: JSON.stringify({
          verification,
          notes: verificationNotes[findingId] ?? "",
        }),
      });
      await Promise.all([
        inspectReviewRun(reviewDetail.id),
        loadRepository(repository.id, { silent: true }),
      ]);
      showToast(
        "success",
        verification === "CONFIRMED"
          ? "Finding confirmed"
          : "Finding marked as false positive"
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Unable to record verification");
    } finally {
      setVerifyingFindingId(null);
    }
  }

  async function testAiReview() {
    const repository = selectedRef.current;
    if (!repository) return;
    setIsTestingAiReview(true);
    try {
      setError("");
      const result = await api<AiReviewTestResult>(`api/repositories/${repository.id}/ai/test`, {
        method: "POST",
      });
      const isSuccess = Boolean(result.ok || result.status === "OK" || result.status === "SUCCESS");
      showToast(
        isSuccess ? "success" : "error",
        isSuccess
          ? (result.message || "AI review connection OK")
          : `AI review check failed: ${result.message}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI review health check failed");
      showToast("error", "AI review check failed");
    } finally {
      setIsTestingAiReview(false);
    }
  }

  async function buildEvidencePreview() {
    const repository = selectedRef.current;
    if (!repository || !prNumber) {
      setError("Provide a pull request number to preview evidence.");
      return;
    }
    try {
      setError("");
      const data = await api<EvidencePreview>(`api/repositories/${repository.id}/evidence/preview`, {
        method: "POST",
        body: JSON.stringify({
          pullRequestNumber: Number(prNumber),
          evidenceContext,
        }),
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate evidence preview");
    }
  }

  async function downloadEvidence() {
    const repository = selectedRef.current;
    if (!repository || !prNumber) {
      setError("Provide a pull request number to download evidence.");
      return;
    }
    try {
      setError("");
      const response = await fetch(apiPath(`api/repositories/${repository.id}/evidence/download`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pullRequestNumber: Number(prNumber),
          evidenceContext,
        }),
      });
      if (!response.ok) {
        const data = await readJsonResponse(response);
        if (response.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        throw new Error(errorMessageFromResponse(data, "Evidence download failed"));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? preview?.filename ?? `pr-${prNumber}-evidence.md`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showToast("success", "Evidence downloaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download evidence");
    }
  }

  const isEnforcing = selected?.checkRunMode === "ENFORCING";
  const filteredDiscovered = (discoveredRepos ?? []).filter((repo) =>
    repo.fullName.toLowerCase().includes(discoveryFilter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          aria-live="polite"
          className="fixed right-5 top-5 z-60 flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-md"
          role="status"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              toast.tone === "success" ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Clean Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <ShieldIcon className="h-4 w-4 text-zinc-900" />
              <span className="text-sm font-semibold tracking-tight text-zinc-900">DiffGuard</span>
            </div>

            {selected && (
              <div className="flex items-center gap-2 border-l border-zinc-200 pl-3 text-xs text-zinc-500">
                <span className="font-medium text-zinc-900">{selected.fullName}</span>
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isEnforcing ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {isEnforcing ? "Enforcing" : "Advisory"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500">
            {currentUser && (
              <span className="hidden sm:inline font-mono text-[11px] text-zinc-400">
                {currentUser.email}
              </span>
            )}
            <button
              className="font-medium text-zinc-600 hover:text-zinc-900 transition"
              onClick={() => void signOut()}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* GitHub Reauth Alert */}
      {githubReauthRequired && (
        <aside aria-label="GitHub reconnection notice" className="border-b border-amber-200 bg-amber-50/50 py-2.5 px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-xs text-amber-900">
            <span>GitHub token expired. Reconnect to resume review webhook dispatch and repo discovery.</span>
            <button
              className="rounded bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              disabled={isReconnectingGithub}
              onClick={() => void reconnectGithub()}
              type="button"
            >
              {isReconnectingGithub ? "Connecting..." : "Reconnect GitHub"}
            </button>
          </div>
        </aside>
      )}

      {/* Main Body */}
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[220px_1fr]">
        {/* Left Column: Repository Navigation */}
        <RepositorySidebar
          discoveryOpen={Boolean(discoveredRepos)}
          onConnect={() => void discoverGithubRepositories()}
          onRefresh={() => void loadRepositories()}
          onSelect={(repositoryId) => {
            setSelectedId(repositoryId);
            setDiscoveredRepos(null);
          }}
          repositories={repositories}
          selectedId={selectedId}
          status={status}
        />

        {/* Right Column: Repository Workspace */}
        <div className="min-w-0 space-y-6">
          {error && (
            <div
              aria-live="assertive"
              className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50/50 px-3.5 py-2.5 text-xs text-rose-800"
              role="alert"
            >
              <span>{error}</span>
              {selectedId && (
                <button
                  className="font-semibold text-rose-900 underline hover:no-underline"
                  onClick={() => void loadRepository(selectedId)}
                  type="button"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Discovery Drawer / Modal */}
          {discoveredRepos ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-zinc-900">Connect Repositories</h2>
                  <a
                    className="text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-2"
                    href="https://github.com/apps/d1ffguard/installations/new"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Install on Org ↗
                  </a>
                </div>
                <button
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                  onClick={() => setDiscoveredRepos(null)}
                  type="button"
                >
                  Close
                </button>
              </div>

              {discoveredRepos.length > 4 && (
                <div className="mt-3">
                  <input
                    className="w-full rounded border border-zinc-200 bg-zinc-50/50 px-3 py-1.5 text-xs placeholder:text-zinc-400 focus:bg-white focus:outline-hidden"
                    onChange={(e) => setDiscoveryFilter(e.target.value)}
                    placeholder="Filter repositories..."
                    value={discoveryFilter}
                  />
                </div>
              )}

              {filteredDiscovered.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500 space-y-2">
                  <p>Can&apos;t find your organization repository?</p>
                  <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                    Ensure the DiffGuard GitHub App is installed on your organization and organization access is granted in GitHub OAuth settings.
                  </p>
                  <div className="pt-2">
                    <a
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 shadow-2xs"
                      href="https://github.com/apps/d1ffguard/installations/new"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Install DiffGuard on Organization ↗
                    </a>
                  </div>
                </div>
              ) : (
                <div className="mt-3 divide-y divide-zinc-100">
                  {filteredDiscovered.map((repo) => (
                    <div
                      className="flex items-center justify-between py-3"
                      key={repo.githubRepositoryId}
                    >
                      <div>
                        <p className="text-xs font-medium text-zinc-900">{repo.fullName}</p>
                        <p className="text-[11px] text-zinc-400">
                          {repo.isInstalledInDiffguard ? "App installed" : "App not installed on repo"} · {repo.permission}
                        </p>
                      </div>

                      {repo.isConnected ? (
                        <span className="rounded bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-400">
                          Connected
                        </span>
                      ) : !repo.isInstalledInDiffguard ? (
                        <a
                          className="rounded border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition"
                          href="https://github.com/apps/d1ffguard/installations/new"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Install App ↗
                        </a>
                      ) : repo.canConnect ? (
                        <button
                          className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 transition"
                          onClick={() => void connectGithubRepository(repo.githubRepositoryId)}
                          type="button"
                        >
                          Connect
                        </button>
                      ) : (
                        <span className="rounded bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-400 cursor-not-allowed">
                          Admin required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : !selected ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center">
              <p className="text-sm font-medium text-zinc-700">
                {selectedId ? "Loading repository..." : "Select a repository"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Choose a repository from the left sidebar to inspect reviews and pilot status.
              </p>
            </div>
          ) : (
            <>
              {/* Clean Repository Summary Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200/80 pb-4">
                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
                    {selected.fullName}
                  </h1>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Check mode: <span className="font-mono text-zinc-700">{selected.checkRunMode}</span> · Drafts:{" "}
                    <span className="font-mono text-zinc-700">{selected.draftPullRequestPolicy}</span> · Retention:{" "}
                    <span className="font-mono text-zinc-700">{selected.retentionDays}d</span>
                  </p>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-zinc-400">Runs:</span>{" "}
                    <span className="font-medium text-zinc-900">{metrics?.totalRuns ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Reliability:</span>{" "}
                    <span className="font-medium text-zinc-900">
                      {pilotStatus ? `${(pilotStatus.reliability * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Gate:</span>{" "}
                    <span
                      className={`font-medium ${
                        pilotStatus?.readyForEnforcement ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {pilotStatus?.status ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Clean Pilot Gate Card */}
              {pilotStatus && (
                <section
                  aria-labelledby="pilot-gate-heading"
                  className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-900" id="pilot-gate-heading">
                        Pilot Gate
                      </h2>
                      <p className="text-xs text-zinc-500">
                        Zero-disruption policy: Requires ≥5 reviewed PRs, ≥95% engine reliability, and ≥1 rule with 10+ verified findings at ≥90% precision.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {pilotStatus.canEnableEnforcing && selected.checkRunMode === "ADVISORY" && (
                        <button
                          className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition disabled:opacity-50"
                          disabled={isSavingSettings}
                          onClick={() => void updateSettings({ checkRunMode: "ENFORCING" })}
                          type="button"
                        >
                          Enable Enforcing Mode
                        </button>
                      )}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          isEnforcing
                            ? "bg-emerald-50 text-emerald-700"
                            : pilotStatus.readyForEnforcement
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isEnforcing || pilotStatus.readyForEnforcement
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />
                        {isEnforcing ? "Enforcing Active" : pilotStatus.readyForEnforcement ? "Ready to Enforce" : "Collecting Evidence"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-zinc-400">Distinct PRs</p>
                      <p className="mt-1 text-base font-semibold text-zinc-900">
                        {pilotStatus.reviewedPullRequestCount} / {pilotStatus.thresholds.minimumReviewedPullRequests}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {pilotStatus.reviewedPullRequestCount >= pilotStatus.thresholds.minimumReviewedPullRequests
                          ? "✓ Threshold met"
                          : "Needs more PRs"}
                      </p>
                    </div>

                    <div>
                      <p className="text-zinc-400">Reliability</p>
                      <p className="mt-1 text-base font-semibold text-zinc-900">
                        {(pilotStatus.reliability * 100).toFixed(1)}%
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {pilotStatus.reliability >= pilotStatus.thresholds.minimumReliability
                          ? "✓ ≥95% target"
                          : "Below 95%"}
                      </p>
                    </div>

                    <div>
                      <p className="text-zinc-400">Enforceable Rules</p>
                      <p className="mt-1 text-base font-semibold text-zinc-900">
                        {pilotStatus.eligibleRules.length}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {pilotStatus.eligibleRules.length > 0 ? "✓ 1 rule qualified" : "Needs 10+ verified findings"}
                      </p>
                    </div>
                  </div>

                  {pilotStatus.blockers.length > 0 && (
                    <div className="mt-4 border-t border-zinc-100 pt-3">
                      <p className="text-[11px] font-medium text-amber-800">Remaining requirements:</p>
                      <ul className="mt-1 list-disc pl-4 text-[11px] text-zinc-600">
                        {pilotStatus.blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {/* Clean Pilot Precision Table */}
              {pilotPrecision.length > 0 && (
                <section
                  aria-labelledby="pilot-precision-heading"
                  className="rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs"
                >
                  <div className="border-b border-zinc-100 pb-3">
                    <h2 className="text-sm font-semibold text-zinc-900" id="pilot-precision-heading">
                      Rule Precision Matrix
                    </h2>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-zinc-100 text-[11px] font-medium text-zinc-400">
                        <tr>
                          <th className="py-2 pr-3">Rule</th>
                          <th className="py-2 pr-3">Total</th>
                          <th className="py-2 pr-3">Confirmed</th>
                          <th className="py-2 pr-3">False Pos.</th>
                          <th className="py-2 pr-3">Unverified</th>
                          <th className="py-2 pr-3">Precision</th>
                          <th className="py-2 text-right">Gate Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-mono text-[11px]">
                        {pilotPrecision.map((rule) => {
                          const isEligible = pilotStatus?.eligibleRules.some(
                            (e) => e.ruleId === rule.ruleId && e.ruleVersion === rule.ruleVersion
                          );

                          return (
                            <tr key={`${rule.ruleId}@${rule.ruleVersion}`}>
                              <td className="py-2.5 pr-3 font-medium text-zinc-800">
                                {rule.ruleId}
                                <span className="text-zinc-400">@{rule.ruleVersion}</span>
                              </td>
                              <td className="py-2.5 pr-3 text-zinc-600">{rule.totalFindings}</td>
                              <td className="py-2.5 pr-3 text-emerald-600 font-semibold">{rule.confirmedCount}</td>
                              <td className="py-2.5 pr-3 text-rose-600">{rule.falsePositiveCount}</td>
                              <td className="py-2.5 pr-3 text-zinc-400">{rule.unverifiedCount}</td>
                              <td className="py-2.5 pr-3 font-semibold text-zinc-800">
                                {(rule.precision * 100).toFixed(0)}%
                              </td>
                              <td className="py-2.5 text-right font-sans">
                                {isEligible ? (
                                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                    ● Eligible
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">Advisory</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Review Runs Table */}
              <ReviewRunsTable
                hasActiveRuns={hasActiveReviewRuns}
                lastRefreshAt={lastRepositoryRefreshAt}
                onInspect={(runId, returnFocus) => void inspectReviewRun(runId, returnFocus)}
                onRerun={(runId) => void rerun(runId)}
                repositoryName={selected.fullName}
                runs={selected.reviewRuns}
                syncState={repositorySyncState}
              />

              {/* Repository Settings */}
              <RepositorySettingsPanels
                isSaving={isSavingSettings}
                isTestingAi={isTestingAiReview}
                onCommitRetention={() => void commitRetention()}
                onMaintainabilityChange={(change) => void updateMaintainabilityPolicy(change)}
                onRepositoryChange={(change) => void updateSettings(change)}
                onRetentionDraftChange={(val) => {
                  retentionDraftDirtyRef.current = true;
                  setRetentionDraft(val);
                }}
                onTestAi={() => void testAiReview()}
                pilotStatus={pilotStatus}
                repository={selected}
                retentionDraft={retentionDraft}
              />

              {/* Governance Policies */}
              <GovernancePolicySettings
                configuration={selected.ruleConfiguration}
                disabled={isSavingSettings}
                key={selected.id}
                onSave={updateGovernancePolicy}
              />

              {/* Evidence Artifact Export */}
              <EvidenceExportPanel
                onDownload={() => void downloadEvidence()}
                onPreview={() => void buildEvidencePreview()}
                onPrNumberChange={(value) => {
                  setPreview(null);
                  setPrNumber(value);
                }}
                onRelevanceChange={setEvidenceContext}
                preview={preview}
                prNumber={prNumber}
                relevance={evidenceContext}
                reviewRuns={selected.reviewRuns}
              />

              {/* Slide-Over Drawer for Review Run Findings */}
              <ReviewDetailPanel
                detail={reviewDetail}
                headingRef={reviewDetailHeadingRef}
                notes={verificationNotes}
                onClose={closeReviewDetail}
                onNotesChange={(findingId, value) => {
                  setVerificationNotes((current) => ({ ...current, [findingId]: value }));
                }}
                onVerify={(findingId, verification) => void verifyPilotFinding(findingId, verification)}
                status={detailStatus}
                verifyingFindingId={verifyingFindingId}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
