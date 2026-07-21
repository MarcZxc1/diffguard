import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/";

type DiscoveredRepository = {
  githubRepositoryId: number;
  fullName: string;
  canConnect: boolean;
  permission: string;
  diffguardRepositoryId?: string;
  isConnected: boolean;
  isInstalledInDiffguard: boolean;
};

type Repository = {
  id: string;
  fullName: string;
  enabled: boolean;
  draftPullRequestPolicy: "SKIP" | "ANALYZE";
  checkRunMode: "ADVISORY" | "ENFORCING";
  llmReviewEnabled: boolean;
  llmModel: string;
  retentionDays: number;
  ruleConfiguration?: RuleConfiguration;
  _count?: { reviewRuns: number };
  reviewRuns?: ReviewRun[];
};

type PathNamingConvention = "OFF" | "KEBAB_CASE" | "CAMEL_CASE" | "SNAKE_CASE";

type MaintainabilityPolicy = {
  enabled: boolean;
  identifierNaming: "OFF" | "CAMEL_PASCAL";
  fileNaming: PathNamingConvention;
  folderNaming: PathNamingConvention;
};

type RuleConfiguration = {
  enabledRuleIds?: string[];
  severityThreshold?: string;
  ignoredPaths?: string[];
  suppressions?: Array<Record<string, unknown>>;
  maintainability?: MaintainabilityPolicy;
};

type ReviewRun = {
  id: string;
  pullRequestNumber: number;
  headSha: string;
  state: string;
  attemptCount: number;
  checkRunConclusion?: string | null;
  checkRunUrl?: string | null;
  llmState?: string;
  llmFailureMessage?: string | null;
  analyzedFileCount: number;
  skippedFileCount: number;
  findingCount: number;
  suppressedFindingCount: number;
  createdAt: string;
  completedAt?: string | null;
};

type Finding = {
  id: string;
  ruleId: string;
  source: string;
  category: string;
  severity: string;
  confidence: number;
  filePath: string;
  lineNumber: number;
  title: string;
  evidence: string;
  explanation: string;
  remediation: string;
  suppressed: boolean;
  suppressionReason?: string | null;
  pilotVerification?: "CONFIRMED" | "FALSE_POSITIVE" | null;
  pilotVerifiedAt?: string | null;
  pilotNotes?: string | null;
};

type ReviewRunDetail = ReviewRun & {
  findings: Finding[];
};

type Metrics = {
  totalRuns: number;
  byState: Record<string, number>;
  retryRate: number;
  githubFailureCount: number;
  averageProcessingMilliseconds: number | null;
  suppressionRate: number;
  skippedFileCount: number;
};

type EvidencePreview = {
  filename: string;
  markdown: string;
  sha256: string;
};

type RulePrecision = {
  ruleId: string;
  ruleVersion: string;
  totalFindings: number;
  confirmedCount: number;
  falsePositiveCount: number;
  unverifiedCount: number;
  precision: number;
};

type PilotStatus = {
  status: "COLLECTING" | "READY";
  readyForEnforcement: boolean;
  canEnableEnforcing: boolean;
  developmentBypass: {
    enabled: boolean;
    active: boolean;
  };
  thresholds: {
    minimumReviewedPullRequests: number;
    minimumReliability: number;
    minimumPrecision: number;
    minimumVerifiedFindings: number;
  };
  reviewedPullRequestCount: number;
  completedRunCount: number;
  successfulRunCount: number;
  partialRunCount: number;
  failedRunCount: number;
  skippedRunCount: number;
  reliability: number;
  eligibleRuleIds: string[];
  eligibleRules: Array<{ ruleId: string; ruleVersion: string }>;
  effectiveEnforceableRules: Array<{ ruleId: string; ruleVersion: string }>;
  blockers: string[];
  rules: Array<RulePrecision & {
    verifiedFindingCount: number;
    eligibleForEnforcement: boolean;
  }>;
};

type AiReviewTestResult = {
  ok: boolean;
  status: string;
  model: string;
  message: string;
};

type Toast = {
  id: number;
  tone: "success" | "error";
  message: string;
};

type AuthResponse = {
  user: { id: string; email: string; role: string };
  token: string;
};

const defaultMaintainabilityPolicy: MaintainabilityPolicy = {
  enabled: false,
  identifierNaming: "CAMEL_PASCAL",
  fileNaming: "OFF",
  folderNaming: "OFF",
};

class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiPath(path: string) {
  return `${API_URL.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

function errorMessageFromResponse(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    if (typeof record.error === "object" && record.error !== null) {
      const error = record.error as Record<string, unknown>;
      if (typeof error.message === "string") {
        const details = error.details as { blockers?: unknown } | undefined;
        const blockers = Array.isArray(details?.blockers)
          ? details.blockers.filter((item): item is string => typeof item === "string")
          : [];
        return blockers.length > 0
          ? `${error.message}: ${blockers.join(" ")}`
          : error.message;
      }
    }
  }
  return fallback;
}

function errorCodeFromResponse(data: unknown) {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.error !== "object" || record.error === null) return undefined;
  const error = record.error as Record<string, unknown>;
  if (typeof error.details !== "object" || error.details === null) return undefined;
  const details = error.details as Record<string, unknown>;
  return typeof details.code === "string" ? details.code : undefined;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function api<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new ApiError(
      errorMessageFromResponse(data, `Request failed with ${response.status}`),
      response.status,
      errorCodeFromResponse(data),
    );
  }
  return data as T;
}

function StatePill({ state }: { state: string }) {
  const tone = state === "SUCCEEDED"
    ? "bg-emerald-100 text-emerald-800"
    : state === "FAILED"
      ? "bg-red-100 text-red-800"
      : state === "PARTIAL"
        ? "bg-amber-100 text-amber-900"
        : state === "SKIPPED"
          ? "bg-slate-200 text-slate-700"
          : "bg-blue-100 text-blue-800";
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${tone}`}>{state}</span>;
}

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

function reviewedPullRequestOptions(reviewRuns: ReviewRun[] | undefined) {
  const seen = new Set<number>();
  return (reviewRuns ?? []).filter((run) => {
    if (seen.has(run.pullRequestNumber)) return false;
    seen.add(run.pullRequestNumber);
    return true;
  });
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Repository | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [thesisRelevance, setThesisRelevance] = useState("");
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
  const hasActiveReviewRuns = Boolean(selected?.reviewRuns?.some((run) =>
    run.state === "QUEUED" || run.state === "PROCESSING"
  ));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code");
    if (codeParam && window.location.pathname === "/auth/callback") {
      window.history.replaceState({}, document.title, "/");
      void exchangeGithubOAuthCode(codeParam);
    }
  }, []);

  async function exchangeGithubOAuthCode(code: string) {
    setAuthError("");
    try {
      const response = await fetch(apiPath("api/auth/github/exchange"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(errorMessageFromResponse(data, "GitHub sign-in failed"));
      setToken((data as AuthResponse).token);
      setGithubReauthRequired(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "GitHub sign-in failed");
    }
  }

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadRepositories();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) return;
    void loadRepository(selectedId);
  }, [token, selectedId]);

  useEffect(() => {
    setReviewDetail(null);
    setDetailStatus("idle");
    setVerificationNotes({});
    setRepositorySyncState("idle");
    setLastRepositoryRefreshAt(null);
  }, [selectedId]);

  useEffect(() => {
    if (!token || !selectedId || discoveredRepos || !hasActiveReviewRuns) return;
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
  }, [token, selectedId, discoveredRepos, hasActiveReviewRuns]);

  useEffect(() => {
    if (!selected) return;
    const options = reviewedPullRequestOptions(selected.reviewRuns);
    if (options.length > 0 && !options.some((run) => String(run.pullRequestNumber) === prNumber)) {
      setPrNumber(String(options[0].pullRequestNumber));
      setPreview(null);
    }
  }, [selected, prNumber]);

  function showToast(tone: Toast["tone"], message: string) {
    const id = Date.now();
    setToast({ id, tone, message });
    window.setTimeout(() => {
      setToast((current) => current?.id === id ? null : current);
    }, 4_000);
  }

  async function loadRepositories() {
    if (!token) return;
    setStatus("loading");
    setError("");
    try {
      const data = await api<Repository[]>("api/repositories", token);
      setRepositories(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
      setStatus("idle");
    } catch (err) {
      if (err instanceof ApiError && err.code === "GITHUB_REAUTH_REQUIRED") {
        setGithubReauthRequired(true);
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load repositories");
    }
  }

  async function loadRepository(id: string, options?: { silent?: boolean }) {
    if (!token) return;
    if (!options?.silent) setError("");
    if (options?.silent) setRepositorySyncState("refreshing");
    try {
      const [repository, metricData, pilotData] = await Promise.all([
        api<Repository>(`api/repositories/${id}`, token),
        api<Metrics>(`api/repositories/${id}/metrics`, token),
        api<PilotStatus>(`api/repositories/${id}/pilot/status`, token),
      ]);
      setSelected(repository);
      setMetrics(metricData);
      setPilotPrecision(pilotData.rules);
      setPilotStatus(pilotData);
      setRepositorySyncState("idle");
      setLastRepositoryRefreshAt(new Date());
    } catch (err) {
      if (options?.silent) {
        setRepositorySyncState("stale");
      } else {
        setSelected(null);
        setMetrics(null);
        setPilotPrecision([]);
        setPilotStatus(null);
        setError(err instanceof Error ? err.message : "Unable to load repository");
      }
    }
  }

  async function discoverGithubRepositories() {
    if (!token) return;
    setStatus("loading");
    setError("");
    try {
      const data = await api<DiscoveredRepository[]>("api/repositories/github/discover", token);
      setDiscoveredRepos(data);
      setStatus("idle");
    } catch (err) {
      if (err instanceof ApiError && err.code === "GITHUB_REAUTH_REQUIRED") {
        setGithubReauthRequired(true);
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to discover repositories");
    }
  }

  async function connectGithubRepository(githubRepositoryId: number) {
    if (!token) return;
    try {
      setError("");
      await api<{ success: boolean; repositoryId: string }>("api/repositories/github/connect", token, {
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
    if (!token || isReconnectingGithub) return;
    setIsReconnectingGithub(true);
    try {
      const result = await api<{ authorizationUrl: string }>("api/auth/github/link", token, {
        method: "POST",
      });
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setIsReconnectingGithub(false);
      setError(err instanceof Error ? err.message : "Unable to reconnect GitHub");
    }
  }

  async function handleAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    const endpoint = isLogin ? "login" : "register";
    const body = isLogin ? { email, password } : { email, password, name };
    try {
      const response = await fetch(apiPath(`api/auth/${endpoint}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(errorMessageFromResponse(data, "Authentication failed"));
      setToken((data as AuthResponse).token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  async function updateSettings(next: Partial<Repository>) {
    if (!token || !selected) return;
    try {
      setError("");
      const updated = await api<Repository>(`api/repositories/${selected.id}/settings`, token, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setSelected({ ...selected, ...updated });
      setRepositories((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update settings");
    }
  }

  async function updateMaintainabilityPolicy(next: Partial<MaintainabilityPolicy>) {
    if (!selected) return;
    await updateSettings({
      ruleConfiguration: {
        ...selected.ruleConfiguration,
        maintainability: {
          ...defaultMaintainabilityPolicy,
          ...selected.ruleConfiguration?.maintainability,
          ...next,
        },
      },
    });
  }

  async function rerun(id: string) {
    if (!token || !selected) return;
    try {
      setError("");
      await api(`api/review-runs/${id}/rerun`, token, { method: "POST" });
      await loadRepository(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rerun review");
    }
  }

  async function inspectReviewRun(id: string) {
    if (!token) return;
    setDetailStatus("loading");
    try {
      const detail = await api<ReviewRunDetail>(`api/review-runs/${id}`, token);
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

  async function verifyPilotFinding(
    findingId: string,
    verification: "CONFIRMED" | "FALSE_POSITIVE",
  ) {
    if (!token || !selected || !reviewDetail || verifyingFindingId) return;
    setVerifyingFindingId(findingId);
    try {
      await api(`api/repositories/${selected.id}/findings/${findingId}/verify`, token, {
        method: "PATCH",
        body: JSON.stringify({
          verification,
          notes: verificationNotes[findingId] ?? "",
        }),
      });
      await Promise.all([
        inspectReviewRun(reviewDetail.id),
        loadRepository(selected.id, { silent: true }),
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
    if (!token || !selected || isTestingAiReview) return;
    setIsTestingAiReview(true);
    try {
      const result = await api<AiReviewTestResult>(`api/repositories/${selected.id}/ai/test`, token, {
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
    if (!token || !selected) return;
    try {
      setError("");
      setPreview(null);
      const data = await api<EvidencePreview>(`api/repositories/${selected.id}/evidence/preview`, token, {
        method: "POST",
        body: JSON.stringify({
          pullRequestNumber: Number(prNumber),
          thesisRelevance,
        }),
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview evidence");
    }
  }

  async function downloadEvidence() {
    if (!token || !selected) return;
    try {
      setError("");
      const response = await fetch(apiPath(`api/repositories/${selected.id}/evidence/download`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pullRequestNumber: Number(prNumber),
          thesisRelevance,
        }),
      });
      if (!response.ok) throw new Error("Evidence download failed");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? preview?.filename ?? "pr-evidence.md";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download evidence");
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-stone-100 text-slate-950">
        <section className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
          <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px]">
            <div className="self-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">DiffGuard</p>
              <h1 className="mt-4 max-w-2xl text-5xl font-black leading-tight">Pull request review operations</h1>
              <p className="mt-5 max-w-xl text-lg text-slate-700">
                Review runs, Check Runs, repository settings, retention controls, and curated PR evidence in one workspace.
              </p>
            </div>
            <form onSubmit={handleAuth} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">{isLogin ? "Sign in" : "Create account"}</h2>
              {authError && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{authError}</p>}
              {!isLogin && (
                <label className="mt-4 block text-sm font-medium">
                  Name
                  <input className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
              )}
              <label className="mt-4 block text-sm font-medium">
                Email
                <input required type="email" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="mt-4 block text-sm font-medium">
                Password
                <input required type="password" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button className="mt-6 w-full rounded bg-slate-950 px-4 py-2 font-semibold text-white" type="submit">
                {isLogin ? "Sign in" : "Register"}
              </button>
              <div className="mt-4 flex items-center gap-4 text-slate-400">
                <hr className="flex-1" />
                <span className="text-xs uppercase tracking-wider font-semibold">Or</span>
                <hr className="flex-1" />
              </div>
              <a href={apiPath("api/auth/github")} className="mt-4 block w-full rounded border border-slate-950 bg-white px-4 py-2 text-center font-semibold text-slate-950 hover:bg-slate-50">
                Continue with GitHub
              </a>
              <button className="mt-6 text-sm font-semibold text-emerald-700" type="button" onClick={() => setIsLogin(!isLogin)}>
                {isLogin ? "Need an account?" : "Already have an account?"}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">DiffGuard</p>
            <h1 className="text-2xl font-black">Review Operations</h1>
          </div>
          <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setToken(null)}>Sign out</button>
        </div>
      </header>

      {githubReauthRequired && (
        <div className="border-b border-amber-300 bg-amber-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <p className="text-sm text-amber-950">
              GitHub authorization expired or was revoked. Reconnect GitHub to discover or connect repositories.
            </p>
            <button
              className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
        <aside className="space-y-3">
          <button className="w-full rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white" onClick={loadRepositories}>Refresh</button>
          {status === "loading" && <p className="rounded bg-white p-3 text-sm">Loading repositories...</p>}
          {status === "error" && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {repositories.length === 0 && status !== "loading" && <p className="rounded bg-white p-3 text-sm">No authorized repositories yet.</p>}
          {repositories.map((repository) => (
            <button
              key={repository.id}
              className={`w-full rounded border p-3 text-left ${selectedId === repository.id && !discoveredRepos ? "border-slate-950 bg-white" : "border-slate-200 bg-white/70"}`}
              onClick={() => { setSelectedId(repository.id); setDiscoveredRepos(null); }}
            >
              <span className="block font-semibold">{repository.fullName}</span>
              <span className="text-xs text-slate-600">{repository._count?.reviewRuns ?? 0} review runs</span>
            </button>
          ))}
          <button className="mt-4 w-full rounded border-2 border-dashed border-slate-300 p-3 text-center text-sm font-semibold text-slate-600 hover:border-slate-400" onClick={discoverGithubRepositories}>
            + Connect Repository
          </button>
        </aside>

        <section className="space-y-6">
          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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
                        className={`rounded px-4 py-2 text-sm font-semibold ${repo.isConnected || !repo.canConnect ? "bg-slate-200 text-slate-500" : "bg-slate-950 text-white"}`}
                        disabled={repo.isConnected || !repo.isInstalledInDiffguard || !repo.canConnect}
                        onClick={() => void connectGithubRepository(repo.githubRepositoryId)}
                      >
                        {repo.isConnected ? "Connected" : !repo.isInstalledInDiffguard ? "Install App First" : repo.canConnect ? "Connect" : "Need Admin/Maintain"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !selected ? (
            <div className="rounded border border-slate-200 bg-white p-8">Select a repository to inspect review history.</div>
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

              <div className="rounded border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">{selected.fullName}</h2>
                    <p className="text-sm text-slate-600">Check mode: {selected.checkRunMode} · Drafts: {selected.draftPullRequestPolicy}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={selected.llmReviewEnabled} onChange={(event) => void updateSettings({ llmReviewEnabled: event.target.checked })} />
                    LLM review
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="text-sm font-medium">
                    Draft PRs
                    <select className="mt-1 w-full rounded border px-3 py-2" value={selected.draftPullRequestPolicy} onChange={(event) => void updateSettings({ draftPullRequestPolicy: event.target.value as Repository["draftPullRequestPolicy"] })}>
                      <option value="SKIP">Skip</option>
                      <option value="ANALYZE">Analyze</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Check Runs
                    <select className="mt-1 w-full rounded border px-3 py-2" value={selected.checkRunMode} onChange={(event) => void updateSettings({ checkRunMode: event.target.value as Repository["checkRunMode"] })}>
                      <option value="ADVISORY">Advisory</option>
                      <option value="ENFORCING" disabled={!pilotStatus?.canEnableEnforcing && selected.checkRunMode !== "ENFORCING"}>
                        Enforcing{pilotStatus?.developmentBypass.active ? " (development bypass)" : ""}
                      </option>
                    </select>
                    {!pilotStatus?.canEnableEnforcing && selected.checkRunMode === "ADVISORY" && (
                      <span className="mt-1 block text-xs text-amber-700">Locked until pilot targets are met</span>
                    )}
                    {pilotStatus?.developmentBypass.active && selected.checkRunMode === "ADVISORY" && (
                      <span className="mt-1 block text-xs text-orange-700">Development bypass permits enforcing while pilot evidence is still collecting</span>
                    )}
                  </label>
                  <label className="text-sm font-medium">
                    Retention days
                    <input className="mt-1 w-full rounded border px-3 py-2" type="number" min={7} max={365} value={selected.retentionDays} onChange={(event) => void updateSettings({ retentionDays: Number(event.target.value) })} />
                  </label>
                  <div className="text-sm font-medium">
                    AI health
                    <button
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      disabled={isTestingAiReview}
                      onClick={() => void testAiReview()}
                      type="button"
                    >
                      {isTestingAiReview ? "Testing..." : "Test AI Review"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">Maintainability Policies</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Optional naming checks are advisory and never participate in the security enforcement gate.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      checked={selected.ruleConfiguration?.maintainability?.enabled ?? false}
                      onChange={(event) => void updateMaintainabilityPolicy({ enabled: event.target.checked })}
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
                      disabled={!(selected.ruleConfiguration?.maintainability?.enabled ?? false)}
                      onChange={(event) => void updateMaintainabilityPolicy({ identifierNaming: event.target.value as MaintainabilityPolicy["identifierNaming"] })}
                      value={selected.ruleConfiguration?.maintainability?.identifierNaming ?? "CAMEL_PASCAL"}
                    >
                      <option value="OFF">Off</option>
                      <option value="CAMEL_PASCAL">camelCase / PascalCase</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    New files
                    <select
                      className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
                      disabled={!(selected.ruleConfiguration?.maintainability?.enabled ?? false)}
                      onChange={(event) => void updateMaintainabilityPolicy({ fileNaming: event.target.value as PathNamingConvention })}
                      value={selected.ruleConfiguration?.maintainability?.fileNaming ?? "OFF"}
                    >
                      <NamingConventionOptions />
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    New folders
                    <select
                      className="mt-1 w-full rounded border px-3 py-2 disabled:bg-slate-100"
                      disabled={!(selected.ruleConfiguration?.maintainability?.enabled ?? false)}
                      onChange={(event) => void updateMaintainabilityPolicy({ folderNaming: event.target.value as PathNamingConvention })}
                      value={selected.ruleConfiguration?.maintainability?.folderNaming ?? "OFF"}
                    >
                      <NamingConventionOptions />
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                  <div>
                    <h2 className="text-lg font-black">Review Runs</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {lastRepositoryRefreshAt ? `Last updated ${lastRepositoryRefreshAt.toLocaleTimeString()}` : "Waiting for repository data"}
                    </p>
                  </div>
                  {hasActiveReviewRuns && (
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${repositorySyncState === "stale" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>
                      {repositorySyncState === "stale" ? "Live update failed · data may be stale" : repositorySyncState === "refreshing" ? "Updating…" : "Live updates active"}
                    </span>
                  )}
                </div>
                {selected.reviewRuns?.length === 0 ? (
                  <p className="p-4 text-sm text-slate-600">No review runs for this repository yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                        <tr>
                          <th className="p-3">PR</th>
                          <th className="p-3">State</th>
                          <th className="p-3">Findings</th>
                          <th className="p-3">Coverage</th>
                          <th className="p-3">LLM</th>
                          <th className="p-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.reviewRuns?.map((run) => (
                          <tr key={run.id} className="border-t">
                            <td className="p-3">#{run.pullRequestNumber}<br /><span className="text-xs text-slate-500">{run.headSha.slice(0, 8)}</span></td>
                            <td className="p-3"><StatePill state={run.state} /></td>
                            <td className="p-3">{run.findingCount} total<br /><span className="text-xs text-slate-500">{run.suppressedFindingCount} suppressed</span></td>
                            <td className="p-3">{run.analyzedFileCount} analyzed<br /><span className="text-xs text-slate-500">{run.skippedFileCount} skipped</span></td>
                            <td className="p-3">
                              <span className="font-semibold">{run.llmState ?? "SKIPPED"}</span>
                              {run.llmState === "FAILED" && run.llmFailureMessage && (
                                <>
                                  <p className="mt-1 max-w-xs text-xs text-red-700">{run.llmFailureMessage}</p>
                                  <p className="mt-1 max-w-xs text-xs text-slate-500">Deterministic review still completed.</p>
                                </>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-2">
                                <button className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => void inspectReviewRun(run.id)}>Inspect</button>
                                <button className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => void rerun(run.id)}>Rerun</button>
                                {run.checkRunUrl && (
                                  <a className="rounded border px-3 py-1 text-xs font-semibold text-emerald-700" href={run.checkRunUrl} target="_blank" rel="noreferrer">GitHub</a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {(detailStatus === "loading" || reviewDetail) && (
                <div className="rounded border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">Pilot Finding Verification</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {reviewDetail ? `PR #${reviewDetail.pullRequestNumber} · ${reviewDetail.headSha.slice(0, 8)}` : "Loading review findings..."}
                      </p>
                    </div>
                    {reviewDetail && (
                      <button className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => setReviewDetail(null)}>Close</button>
                    )}
                  </div>
                  {detailStatus === "loading" ? (
                    <p className="mt-4 text-sm text-slate-600">Loading findings...</p>
                  ) : reviewDetail?.findings.length === 0 ? (
                    <p className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-600">This review run has no findings to classify.</p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {reviewDetail?.findings.map((finding) => (
                        <article key={finding.id} className="rounded border border-slate-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">{finding.title}</p>
                              <p className="mt-1 font-mono text-xs text-slate-600">{finding.filePath}:{finding.lineNumber} · {finding.ruleId}</p>
                            </div>
                            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{finding.severity} · {Math.round(finding.confidence * 100)}%</span>
                          </div>
                          <p className="mt-3 text-sm"><span className="font-semibold">Evidence:</span> {finding.evidence}</p>
                          <p className="mt-2 text-sm text-slate-700">{finding.explanation}</p>
                          <p className="mt-2 text-sm text-slate-700"><span className="font-semibold">Remediation:</span> {finding.remediation}</p>
                          {finding.suppressed ? (
                            <p className="mt-3 rounded bg-slate-100 p-2 text-xs text-slate-600">Suppressed: {finding.suppressionReason ?? "No reason recorded"}. Suppressed findings are excluded from pilot precision.</p>
                          ) : finding.category !== "SECURITY" || finding.source !== "DETERMINISTIC" ? (
                            <p className="mt-3 rounded bg-blue-50 p-2 text-xs text-blue-800">This {finding.source.toLowerCase()} {finding.category.toLowerCase()} finding remains advisory and is excluded from the deterministic enforcement gate.</p>
                          ) : (
                            <div className="mt-4 border-t pt-4">
                              <label className="block text-sm font-medium" htmlFor={`pilot-notes-${finding.id}`}>
                                Verification notes (optional)
                              </label>
                              <textarea
                                id={`pilot-notes-${finding.id}`}
                                className="mt-1 min-h-20 w-full rounded border px-3 py-2 text-sm"
                                maxLength={2000}
                                value={verificationNotes[finding.id] ?? ""}
                                onChange={(event) => setVerificationNotes((current) => ({ ...current, [finding.id]: event.target.value }))}
                                placeholder="Record the code-review evidence for this decision."
                              />
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                  disabled={verifyingFindingId !== null}
                                  onClick={() => void verifyPilotFinding(finding.id, "CONFIRMED")}
                                  type="button"
                                >
                                  {verifyingFindingId === finding.id ? "Saving..." : "Confirm finding"}
                                </button>
                                <button
                                  className="rounded bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                  disabled={verifyingFindingId !== null}
                                  onClick={() => void verifyPilotFinding(finding.id, "FALSE_POSITIVE")}
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
                </div>
              )}

              <div className="rounded border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-black">Save PR Evidence</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Select a reviewed pull request from this repository, or type a PR number manually if it has not been reviewed yet.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,280px)_1fr_auto_auto]">
                  {reviewedPullRequestOptions(selected.reviewRuns).length > 0 ? (
                    <select
                      className="rounded border px-3 py-2"
                      value={reviewedPullRequestOptions(selected.reviewRuns).some((run) => String(run.pullRequestNumber) === prNumber) ? prNumber : "manual"}
                      onChange={(event) => {
                        setPreview(null);
                        if (event.target.value !== "manual") setPrNumber(event.target.value);
                      }}
                    >
                      {reviewedPullRequestOptions(selected.reviewRuns).map((run) => (
                        <option key={`${run.pullRequestNumber}-${run.id}`} value={run.pullRequestNumber}>
                          #{run.pullRequestNumber} · {run.state} · {run.headSha.slice(0, 8)}
                        </option>
                      ))}
                      <option value="manual">Manual PR number...</option>
                    </select>
                  ) : (
                    <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      No reviewed PRs yet
                    </p>
                  )}
                  <input
                    className="rounded border px-3 py-2"
                    inputMode="numeric"
                    min={1}
                    placeholder="Manual PR number"
                    type="number"
                    value={prNumber}
                    onChange={(event) => {
                      setPreview(null);
                      setPrNumber(event.target.value);
                    }}
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input className="rounded border px-3 py-2" placeholder="Thesis relevance" value={thesisRelevance} onChange={(event) => setThesisRelevance(event.target.value)} />
                  <button className="rounded border px-3 py-2 text-sm font-semibold" onClick={() => void buildEvidencePreview()}>Preview</button>
                  <button className="rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white" onClick={() => void downloadEvidence()}>Download</button>
                </div>
                {preview && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold">{preview.filename}</p>
                    <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{preview.markdown}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
