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

type AuthResponse = {
  user: { id: string; email: string; role: string };
};

type SessionResponse = {
  user: { id: string; role: string };
};

const defaultMaintainabilityPolicy: MaintainabilityPolicy = {
  enabled: false,
  identifierNaming: "CAMEL_PASCAL",
  fileNaming: "OFF",
  folderNaming: "OFF",
};

export default function App() {
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
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [retentionDraft, setRetentionDraft] = useState("");
  const repositoryRequestRef = useRef<AbortController | null>(null);
  const repositoryRequestSequenceRef = useRef(0);
  const settingsSavingRef = useRef(false);
  const selectedRef = useRef<Repository | null>(null);
  const reviewDetailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const reviewDetailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const hasActiveReviewRuns = Boolean(selected?.reviewRuns?.some((run) =>
    run.state === "QUEUED" || run.state === "PROCESSING"
  ));

  

  const showToast = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now();
    setToast({ id, tone, message });
    window.setTimeout(() => {
      setToast((current) => current?.id === id ? null : current);
    }, 4_000);
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

  const loadRepository = useCallback(async (id: string, options?: { silent?: boolean }) => {
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
  }, [clearRepositoryState]);

  

  useEffect(() => {
    const expireSession = () => {
      repositoryRequestRef.current?.abort();
      clearRepositoryState();
      setRepositories([]);
      setSelectedId(null);
      setDiscoveredRepos(null);
      
      window.location.href = "/auth/login";
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, [clearRepositoryState]);

  useEffect(() => {
    
    void loadRepositories();
  }, [loadRepositories]);

  useEffect(() => {
    clearRepositoryState();
    if (!selectedId) return;
    void loadRepository(selectedId);
    return () => {
      repositoryRequestRef.current?.abort();
      repositoryRequestSequenceRef.current += 1;
    };
  }, [clearRepositoryState, loadRepository, selectedId]);

  useEffect(() => {
    if (
      
      !selectedId ||
      discoveredRepos ||
      !hasActiveReviewRuns
    ) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    const poll = async () => {
      await loadRepository(selectedId, { silent: true });
      if (!cancelled) timeoutId = window.setTimeout(poll, 3_000);
    };
    timeoutId = window.setTimeout(poll, 3_000);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [selectedId, discoveredRepos, hasActiveReviewRuns, loadRepository]);

  useEffect(() => {
    selectedRef.current = selected;
    setRetentionDraft(selected ? String(selected.retentionDays) : "");
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
      const data = await api<DiscoveredRepository[]>("api/repositories/github/discover");
      setDiscoveredRepos(data);
      setStatus("idle");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.code === "GITHUB_REAUTH_REQUIRED") {
        setGithubReauthRequired(true);
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
      });
      await loadRepositories();
      setDiscoveredRepos(null); // close discovery
    } catch (err) {
      if (err instanceof ApiError && err.code === "GITHUB_REAUTH_REQUIRED") {
        setGithubReauthRequired(true);
      }
      setError(err instanceof Error ? err.message : "Unable to connect repository");
    }
  }

  async function reconnectGithub() {
    if (isReconnectingGithub) return;
    setIsReconnectingGithub(true);
    try {
      const result = await api<{ authorizationUrl: string }>("api/auth/github/link", {
        method: "POST",
      });
      window.location.assign(result.authorizationUrl);
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
      setRepositories((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update settings");
      return false;
    } finally {
      settingsSavingRef.current = false;
      setIsSavingSettings(false);
    }
  }, []);

  async function commitRetention() {
    const repository = selectedRef.current;
    if (!repository) return;
    const retentionDays = Number(retentionDraft);
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < 7 ||
      retentionDays > 365
    ) {
      setRetentionDraft(String(repository.retentionDays));
      setError("Retention days must be a whole number between 7 and 365.");
      return;
    }
    if (retentionDays === repository.retentionDays) return;
    const saved = await updateSettings({ retentionDays });
    if (!saved) setRetentionDraft(String(selectedRef.current?.retentionDays ?? repository.retentionDays));
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
        governance,
      ),
    });
  }

  async function rerun(id: string) {
    const repository = selectedRef.current;
    if (!repository) return;
    try {
      setError("");
      await api(`api/review-runs/${id}/rerun`, { method: "POST" });
      await loadRepository(repository.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rerun review");
    }
  }

  async function inspectReviewRun(id: string, returnFocus?: HTMLButtonElement) {
    if (returnFocus) reviewDetailReturnFocusRef.current = returnFocus;
    setDetailStatus("loading");
    try {
      const detail = await api<ReviewRunDetail>(`api/review-runs/${id}`);
      setReviewDetail(detail);
      setVerificationNotes(Object.fromEntries(
        detail.findings.map((finding) => [finding.id, finding.pilotNotes ?? ""]),
      ));
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
    verification: "CONFIRMED" | "FALSE_POSITIVE",
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
      showToast("success", verification === "CONFIRMED"
        ? "Finding recorded as confirmed."
        : "Finding recorded as a false positive.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Unable to verify finding");
    } finally {
      setVerifyingFindingId(null);
    }
  }

  async function testAiReview() {
    const repository = selectedRef.current;
    if (!repository || isTestingAiReview) return;
    setIsTestingAiReview(true);
    try {
      const result = await api<AiReviewTestResult>(`api/repositories/${repository.id}/ai/test`, {
        method: "POST",
      });
      showToast(result.ok ? "success" : "error", result.message);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Unable to test AI review");
    } finally {
      setIsTestingAiReview(false);
    }
  }

  async function buildEvidencePreview() {
    const repository = selectedRef.current;
    if (!repository) return;
    try {
      setError("");
      setPreview(null);
      const data = await api<EvidencePreview>(`api/repositories/${repository.id}/evidence/preview`, {
        method: "POST",
        body: JSON.stringify({
          pullRequestNumber: Number(prNumber),
          evidenceContext,
        }),
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview evidence");
    }
  }

  async function downloadEvidence() {
    const repository = selectedRef.current;
    if (!repository) return;
    try {
      setError("");
      const response = await fetch(apiPath(`api/repositories/${repository.id}/evidence/download`), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
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
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? preview?.filename ?? "pr-evidence.md";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download evidence");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f2ea] text-slate-950">
      {toast && (
        <div
          aria-live="polite"
          className={`fixed right-4 top-4 z-50 max-w-md rounded border px-4 py-3 text-sm shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">DiffGuard</p>
            <h1 className="text-2xl font-black">Review Operations</h1>
          </div>
          <button
            className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold"
            onClick={() => void signOut()}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      {githubReauthRequired && (
        <div className="border-b border-amber-300 bg-amber-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <p className="text-sm text-amber-950">
              GitHub authorization expired or was revoked. Reconnect GitHub to discover or connect repositories.
            </p>
            <button
              className="rounded bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isReconnectingGithub}
              onClick={() => void reconnectGithub()}
              type="button"
            >
              {isReconnectingGithub ? "Connecting..." : "Reconnect GitHub"}
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
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

        <section className="min-w-0 space-y-6">
          {error && (
            <p aria-live="assertive" className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          {discoveredRepos ? (
            <div className="rounded border border-slate-200 bg-white p-5">
              <h2 className="text-xl font-black mb-4">Discover Repositories</h2>
              {discoveredRepos.length === 0 ? (
                <p className="text-sm text-slate-600">No repositories found. Ensure the DiffGuard GitHub App is installed on your repositories.</p>
              ) : (
                <div className="space-y-3">
                  {discoveredRepos.map((repo) => (
                    <div key={repo.githubRepositoryId} className="flex items-center justify-between rounded border p-4">
                      <div>
                        <p className="font-semibold">{repo.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {repo.isInstalledInDiffguard ? "App is installed" : "App not installed on GitHub"} · GitHub permission: {repo.permission}
                        </p>
                      </div>
                      {!repo.canConnect && repo.isInstalledInDiffguard && !repo.isConnected && (
                        <p className="max-w-xs text-xs text-amber-700">Admin or maintain access is required to connect this repository.</p>
                      )}
                      <button
                        className={`rounded px-4 py-2 text-sm font-semibold ${repo.isConnected || !repo.canConnect ? "bg-slate-200 text-slate-500" : "bg-[#0f172a] text-white"}`}
                        disabled={repo.isConnected || !repo.isInstalledInDiffguard || !repo.canConnect}
                        onClick={() => void connectGithubRepository(repo.githubRepositoryId)}
                        type="button"
                      >
                        {repo.isConnected ? "Connected" : !repo.isInstalledInDiffguard ? "Install App First" : repo.canConnect ? "Connect" : "Need Admin/Maintain"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !selected ? (
            <div className="rounded border border-slate-200 bg-white p-8" role={selectedId ? "status" : undefined}>
              {selectedId ? "Loading repository…" : "Select a repository to inspect review history."}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">Runs</p><p className="text-2xl font-black">{metrics?.totalRuns ?? 0}</p></div>
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">Retry rate</p><p className="text-2xl font-black">{Math.round((metrics?.retryRate ?? 0) * 100)}%</p></div>
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">GitHub failures</p><p className="text-2xl font-black">{metrics?.githubFailureCount ?? 0}</p></div>
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">Skipped files</p><p className="text-2xl font-black">{metrics?.skippedFileCount ?? 0}</p></div>
              </div>

              {pilotStatus && (
                <div className={`rounded border p-5 ${pilotStatus.readyForEnforcement ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Advisory pilot</p>
                      <h2 className="mt-1 text-lg font-black">
                        {pilotStatus.readyForEnforcement ? "Evidence threshold met" : "Collecting evidence"}
                      </h2>
                    </div>
                    <span className={`rounded px-2 py-1 text-xs font-bold ${pilotStatus.readyForEnforcement ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"}`}>
                      {pilotStatus.status}
                    </span>
                  </div>
                  {pilotStatus.developmentBypass.enabled && (
                    <div className="mt-4 rounded border border-orange-300 bg-orange-100 p-3 text-sm text-orange-950" role="alert">
                      <strong>Development enforcement bypass enabled.</strong>{" "}
                      Real pilot status remains {pilotStatus.status}; production rejects this configuration.
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded bg-white/70 p-3">
                      <p className="text-xs text-slate-600">Distinct reviewed PRs</p>
                      <p className="text-xl font-black">{pilotStatus.reviewedPullRequestCount} / {pilotStatus.thresholds.minimumReviewedPullRequests}</p>
                    </div>
                    <div className="rounded bg-white/70 p-3">
                      <p className="text-xs text-slate-600">Full-coverage reliability</p>
                      <p className="text-xl font-black">{(pilotStatus.reliability * 100).toFixed(1)}% / {(pilotStatus.thresholds.minimumReliability * 100).toFixed(0)}%</p>
                    </div>
                    <div className="rounded bg-white/70 p-3">
                      <p className="text-xs text-slate-600">Eligible rule versions</p>
                      <p className="text-xl font-black">{pilotStatus.eligibleRules.length}</p>
                    </div>
                  </div>
                  {pilotStatus.blockers.length > 0 && (
                    <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-950">
                      {pilotStatus.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                  )}
                  <p className="mt-4 text-xs text-slate-600">
                    Partial and failed analyses reduce reliability. Only eligible deterministic rules can fail an enforcing Check Run; AI findings remain advisory.
                  </p>
                </div>
              )}

              {pilotPrecision.length > 0 && (
                <div className="rounded border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-black">Pilot Precision by Rule</h2>
                  <table className="mt-4 w-full text-left text-sm">
                    <caption className="sr-only">
                      Pilot precision, verification counts, and enforcement eligibility by rule
                    </caption>
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="p-3">Rule</th>
                        <th className="p-3">Total</th>
                        <th className="p-3">Confirmed</th>
                        <th className="p-3">False Pos.</th>
                        <th className="p-3">Unverified</th>
                        <th className="p-3">Precision</th>
                        <th className="p-3">Gate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pilotPrecision.map((rule) => (
                        <tr key={`${rule.ruleId}@${rule.ruleVersion}`} className="border-t">
                          <td className="p-3 font-mono text-xs">{rule.ruleId}@{rule.ruleVersion}</td>
                          <td className="p-3">{rule.totalFindings}</td>
                          <td className="p-3 text-emerald-700">{rule.confirmedCount}</td>
                          <td className="p-3 text-red-700">{rule.falsePositiveCount}</td>
                          <td className="p-3 text-slate-500">{rule.unverifiedCount}</td>
                          <td className="p-3 font-semibold">
                            {(rule.precision * 100).toFixed(1)}%
                          </td>
                          <td className="p-3">
                            {pilotStatus?.eligibleRules.some((eligible) =>
                              eligible.ruleId === rule.ruleId && eligible.ruleVersion === rule.ruleVersion
                            ) ? (
                              <span className="font-semibold text-emerald-700">Eligible</span>
                            ) : (
                              <span className="text-slate-500">Advisory</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <RepositorySettingsPanels
                isSaving={isSavingSettings}
                isTestingAi={isTestingAiReview}
                onCommitRetention={() => void commitRetention()}
                onMaintainabilityChange={(change) => void updateMaintainabilityPolicy(change)}
                onRepositoryChange={(change) => void updateSettings(change)}
                onRetentionDraftChange={setRetentionDraft}
                onTestAi={() => void testAiReview()}
                pilotStatus={pilotStatus}
                repository={selected}
                retentionDraft={retentionDraft}
              />

              <GovernancePolicySettings
                configuration={selected.ruleConfiguration}
                disabled={isSavingSettings}
                key={selected.id}
                onSave={updateGovernancePolicy}
              />

              <ReviewRunsTable
                hasActiveRuns={hasActiveReviewRuns}
                lastRefreshAt={lastRepositoryRefreshAt}
                onInspect={(runId, returnFocus) => void inspectReviewRun(runId, returnFocus)}
                onRerun={(runId) => void rerun(runId)}
                repositoryName={selected.fullName}
                runs={selected.reviewRuns}
                syncState={repositorySyncState}
              />

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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
