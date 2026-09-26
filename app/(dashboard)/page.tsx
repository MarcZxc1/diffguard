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
  AlertTriangleIcon,
  CheckCircleIcon,
  CheckIcon,
  ExternalLinkIcon,
  GithubIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  UnlockIcon,
  XIcon,
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
    }, 4000);
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

        // Sync retention draft only if not actively dirty
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

  // Reliable Smart Polling: 3s when runs active, 20s when idle
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
      showToast("success", "Repository connected successfully!");
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
      showToast("success", "Settings updated successfully.");
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
      setError("Retention days must be a whole number between 7 and 365.");
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
      showToast("success", "Review rerun queued.");
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
          ? "Finding marked as confirmed."
          : "Finding marked as false positive."
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Unable to update finding verification");
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
      showToast(
        result.status === "SUCCESS" ? "success" : "error",
        result.status === "SUCCESS"
          ? "AI Review health check passed!"
          : `AI Review check failed: ${result.message}`
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
      showToast("success", "Evidence preview generated.");
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
      showToast("success", "Evidence artifact downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download evidence");
    }
  }

  const isEnforcing = selected?.checkRunMode === "ENFORCING";
  const filteredDiscovered = (discoveredRepos ?? []).filter((repo) =>
    repo.fullName.toLowerCase().includes(discoveryFilter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans text-slate-900 antialiased selection:bg-slate-900 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          aria-live="polite"
          className={`fixed right-5 top-5 z-60 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-bold shadow-xl transition-all ${
            toast.tone === "success"
              ? "border-emerald-200 bg-white text-emerald-800 ring-1 ring-emerald-600/10"
              : "border-rose-200 bg-white text-rose-800 ring-1 ring-rose-600/10"
          }`}
          role="status"
        >
          {toast.tone === "success" ? (
            <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircleIcon className="h-4 w-4 text-rose-600" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
                <ShieldIcon className="h-5 w-5" />
              </div>
              <div>
                <span className="text-sm font-black tracking-tight text-slate-950">DiffGuard</span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  SecOps
                </span>
              </div>
            </div>

            {selected && (
              <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-4 text-xs font-semibold text-slate-600">
                <span className="text-slate-400">/</span>
                <span className="font-bold text-slate-900">{selected.fullName}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isEnforcing
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isEnforcing ? "bg-emerald-600" : "bg-amber-500"
                    }`}
                  />
                  {isEnforcing ? "Enforcing" : "Advisory"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                  {currentUser.email.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate max-w-[180px]">{currentUser.email}</span>
              </div>
            )}
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              onClick={() => void signOut()}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* GitHub Reconnect Warning Banner */}
      {githubReauthRequired && (
        <aside aria-label="GitHub reconnection notice" className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                GitHub authorization token expired. Reconnect your GitHub account to continue discovering and reviewing repositories.
              </span>
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-800 disabled:opacity-50"
              disabled={isReconnectingGithub}
              onClick={() => void reconnectGithub()}
              type="button"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              {isReconnectingGithub ? "Connecting..." : "Reconnect GitHub"}
            </button>
          </div>
        </aside>
      )}

      {/* Main Workspace Layout */}
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
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

        {/* Content Area */}
        <div className="min-w-0 space-y-6">
          {/* Error Banner with Retry */}
          {error && (
            <div
              aria-live="assertive"
              className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-semibold text-rose-800"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <AlertCircleIcon className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
              {selectedId && (
                <button
                  className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-50"
                  onClick={() => void loadRepository(selectedId)}
                  type="button"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Discovery Panel */}
          {discoveredRepos ? (
            <section className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Connect GitHub Repositories</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Select a repository with the DiffGuard GitHub App installed to begin automatic PR reviews.
                  </p>
                </div>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setDiscoveredRepos(null)}
                  type="button"
                >
                  Close
                </button>
              </div>

              {discoveredRepos.length > 3 && (
                <div className="mt-4">
                  <input
                    className="w-full rounded-md border border-slate-200 bg-slate-50/50 py-1.5 px-3 text-xs placeholder:text-slate-400 focus:bg-white focus:outline-hidden"
                    onChange={(e) => setDiscoveryFilter(e.target.value)}
                    placeholder="Search discovered repositories..."
                    value={discoveryFilter}
                  />
                </div>
              )}

              {filteredDiscovered.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-8 text-center">
                  <GithubIcon className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    No repositories found matching your search.
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Ensure the DiffGuard GitHub App is installed on your GitHub organization or user account.
                  </p>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {filteredDiscovered.map((repo) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50/50 transition"
                      key={repo.githubRepositoryId}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{repo.fullName}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {repo.permission}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {repo.isInstalledInDiffguard
                            ? "✓ DiffGuard App installed"
                            : "⚠ App not installed on GitHub repo"}
                        </p>
                      </div>

                      <button
                        className={`rounded-lg px-4 py-1.5 text-xs font-bold transition shadow-2xs ${
                          repo.isConnected
                            ? "border border-slate-200 bg-slate-100 text-slate-500 cursor-default"
                            : !repo.isInstalledInDiffguard
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : repo.canConnect
                            ? "bg-slate-900 text-white hover:bg-slate-800"
                            : "border border-amber-200 bg-amber-50 text-amber-800 cursor-not-allowed"
                        }`}
                        disabled={repo.isConnected || !repo.isInstalledInDiffguard || !repo.canConnect}
                        onClick={() => void connectGithubRepository(repo.githubRepositoryId)}
                        type="button"
                      >
                        {repo.isConnected
                          ? "Connected"
                          : !repo.isInstalledInDiffguard
                          ? "Install App First"
                          : repo.canConnect
                          ? "Connect Repository"
                          : "Admin Permission Needed"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : !selected ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <ShieldIcon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {selectedId ? "Loading Repository..." : "No Repository Selected"}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {selectedId
                  ? "Fetching review history, pilot status, and security metrics."
                  : "Choose an authorized repository from the sidebar or connect a new GitHub repository."}
              </p>
            </div>
          ) : (
            <>
              {/* Stat Cards Overview */}
              <section aria-label="Repository overview metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Total Review Runs
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {metrics?.totalRuns ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">Continuous SAST evaluations</p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Worker Retry Rate
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {Math.round((metrics?.retryRate ?? 0) * 100)}%
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">Zero retry queue contention</p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    GitHub Failures
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {metrics?.githubFailureCount ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">Upstream API exceptions</p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Files Analyzed
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {selected.reviewRuns?.reduce((acc, r) => acc + r.analyzedFileCount, 0) ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {metrics?.skippedFileCount ?? 0} files skipped by rule
                  </p>
                </div>
              </section>

              {/* Pilot Gate Command Center */}
              {pilotStatus && (
                <section
                  aria-labelledby="pilot-gate-heading"
                  className={`rounded-xl border p-6 shadow-xs transition-all ${
                    pilotStatus.readyForEnforcement
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-amber-200 bg-amber-50/60"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        {pilotStatus.readyForEnforcement ? (
                          <ShieldCheckIcon className="h-5 w-5 text-emerald-700" />
                        ) : (
                          <ShieldIcon className="h-5 w-5 text-amber-700" />
                        )}
                        <h2 className="text-base font-bold text-slate-900" id="pilot-gate-heading">
                          {pilotStatus.readyForEnforcement
                            ? "Pilot Gate: Ready for Enforcement"
                            : "Pilot Gate: Collecting Ground Truth Evidence"}
                        </h2>
                      </div>
                      <p className="mt-1 max-w-2xl text-xs text-slate-600">
                        DiffGuard safeguards your engineering velocity: Check Runs will only block PRs once
                        the review engine demonstrates ≥95% reliability and at least one rule achieves ≥90%
                        human-confirmed precision.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                          pilotStatus.readyForEnforcement
                            ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/30"
                            : "bg-amber-100 text-amber-900 ring-1 ring-amber-600/30"
                        }`}
                      >
                        {pilotStatus.status}
                      </span>
                    </div>
                  </div>

                  {/* 3 Milestone Cards */}
                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    {/* Milestone 1: Distinct Reviewed PRs */}
                    <div className="rounded-xl border border-black/5 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>Distinct PRs Reviewed</span>
                        <span
                          className={
                            pilotStatus.reviewedPullRequestCount >=
                            pilotStatus.thresholds.minimumReviewedPullRequests
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }
                        >
                          {pilotStatus.reviewedPullRequestCount >=
                          pilotStatus.thresholds.minimumReviewedPullRequests
                            ? "Target Met"
                            : "Collecting"}
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {pilotStatus.reviewedPullRequestCount}{" "}
                        <span className="text-sm font-semibold text-slate-400">
                          / {pilotStatus.thresholds.minimumReviewedPullRequests}
                        </span>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (pilotStatus.reviewedPullRequestCount /
                                pilotStatus.thresholds.minimumReviewedPullRequests) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Milestone 2: Reliability */}
                    <div className="rounded-xl border border-black/5 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>Engine Reliability</span>
                        <span
                          className={
                            pilotStatus.reliability >= pilotStatus.thresholds.minimumReliability
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }
                        >
                          {pilotStatus.reliability >= pilotStatus.thresholds.minimumReliability
                            ? "Target Met"
                            : "Below 95%"}
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {(pilotStatus.reliability * 100).toFixed(1)}%{" "}
                        <span className="text-sm font-semibold text-slate-400">
                          / {(pilotStatus.thresholds.minimumReliability * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pilotStatus.reliability >= pilotStatus.thresholds.minimumReliability
                              ? "bg-emerald-600"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, pilotStatus.reliability * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Milestone 3: Eligible Rule Versions */}
                    <div className="rounded-xl border border-black/5 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>Enforceable Rules</span>
                        <span
                          className={
                            pilotStatus.eligibleRules.length > 0
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }
                        >
                          {pilotStatus.eligibleRules.length > 0 ? "Qualified" : "Needs 10+ Confirmed"}
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {pilotStatus.eligibleRules.length}{" "}
                        <span className="text-sm font-semibold text-slate-400">
                          rule{pilotStatus.eligibleRules.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                          style={{
                            width: `${pilotStatus.eligibleRules.length > 0 ? 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Active Blocker Warnings */}
                  {pilotStatus.blockers.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
                      <p className="text-xs font-bold text-amber-900">
                        Remaining Requirements Before Enforcement:
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-amber-800">
                        {pilotStatus.blockers.map((b) => (
                          <li className="flex items-start gap-1.5" key={b}>
                            <AlertCircleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Quick Enforcement Toggle Banner */}
                  {pilotStatus.canEnableEnforcing && selected.checkRunMode === "ADVISORY" && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-100/60 p-4">
                      <div className="text-xs text-emerald-950">
                        <span className="font-bold">Pilot Gate Unlocked:</span> You can now switch Check
                        Runs to Enforcing mode to block pull requests containing verified security vulnerabilities.
                      </div>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800 focus:ring-2 focus:ring-emerald-700 focus:outline-hidden disabled:opacity-50"
                        disabled={isSavingSettings}
                        onClick={() => void updateSettings({ checkRunMode: "ENFORCING" })}
                        type="button"
                      >
                        <ShieldCheckIcon className="h-4 w-4" />
                        Activate Enforcement Now
                      </button>
                    </div>
                  )}

                  {selected.checkRunMode === "ENFORCING" && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-100/60 p-3 text-xs font-bold text-emerald-950">
                      <ShieldCheckIcon className="h-4 w-4 text-emerald-700" />
                      <span>
                        Enforcing mode is active. Pull requests violating eligible rules will be blocked.
                      </span>
                    </div>
                  )}
                </section>
              )}

              {/* Pilot Precision Table */}
              {pilotPrecision.length > 0 && (
                <section
                  aria-labelledby="pilot-precision-heading"
                  className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs"
                >
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-base font-bold text-slate-900" id="pilot-precision-heading">
                      Pilot Precision by Security Rule
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Rules require at least 10 human-verified findings with ≥90% precision to become eligible for enforcement.
                    </p>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">
                        Pilot precision, verification counts, and enforcement eligibility by rule
                      </caption>
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="p-3">Rule Identifier</th>
                          <th className="p-3">Total</th>
                          <th className="p-3 text-emerald-700">Confirmed</th>
                          <th className="p-3 text-rose-700">False Pos.</th>
                          <th className="p-3 text-slate-400">Unverified</th>
                          <th className="p-3">Precision</th>
                          <th className="p-3 text-right">Gate Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pilotPrecision.map((rule) => {
                          const isEligible = pilotStatus?.eligibleRules.some(
                            (e) => e.ruleId === rule.ruleId && e.ruleVersion === rule.ruleVersion
                          );

                          return (
                            <tr
                              className={`transition hover:bg-slate-50/50 ${
                                isEligible ? "bg-emerald-50/30" : ""
                              }`}
                              key={`${rule.ruleId}@${rule.ruleVersion}`}
                            >
                              <td className="p-3 font-mono font-medium text-slate-800">
                                {rule.ruleId}
                                <span className="ml-1 text-[10px] text-slate-400">
                                  @{rule.ruleVersion}
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-slate-700">{rule.totalFindings}</td>
                              <td className="p-3 font-bold text-emerald-700">{rule.confirmedCount}</td>
                              <td className="p-3 font-bold text-rose-700">{rule.falsePositiveCount}</td>
                              <td className="p-3 text-slate-400">{rule.unverifiedCount}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">
                                    {(rule.precision * 100).toFixed(0)}%
                                  </span>
                                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className={`h-full rounded-full ${
                                        rule.precision >= 0.9 ? "bg-emerald-600" : "bg-amber-500"
                                      }`}
                                      style={{ width: `${rule.precision * 100}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                {isEligible ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    <CheckIcon className="h-3 w-3" />
                                    Eligible to Enforce
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                    Advisory Only
                                  </span>
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
