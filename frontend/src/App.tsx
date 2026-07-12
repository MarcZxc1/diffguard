import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/";

type Repository = {
  id: string;
  fullName: string;
  enabled: boolean;
  draftPullRequestPolicy: "SKIP" | "ANALYZE";
  checkRunMode: "ADVISORY" | "ENFORCING";
  llmReviewEnabled: boolean;
  llmModel: string;
  retentionDays: number;
  _count?: { reviewRuns: number };
  reviewRuns?: ReviewRun[];
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
  analyzedFileCount: number;
  skippedFileCount: number;
  findingCount: number;
  suppressedFindingCount: number;
  createdAt: string;
  completedAt?: string | null;
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
  totalFindings: number;
  confirmedCount: number;
  falsePositiveCount: number;
  unverifiedCount: number;
  precision: number;
};

function apiPath(path: string) {
  return `${API_URL.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

async function api<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...options,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? `Request failed with ${response.status}`);
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
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load repositories");
    }
  }

  async function loadRepository(id: string) {
    if (!token) return;
    setError("");
    try {
      const [repository, metricData, precisionData] = await Promise.all([
        api<Repository>(`api/repositories/${id}`, token),
        api<Metrics>(`api/repositories/${id}/metrics`, token),
        api<RulePrecision[]>(`api/repositories/${id}/pilot/precision`, token),
      ]);
      setSelected(repository);
      setMetrics(metricData);
      setPilotPrecision(precisionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load repository");
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Authentication failed");
      setToken(data.token);
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
              <button className="mt-4 text-sm font-semibold text-emerald-700" type="button" onClick={() => setIsLogin(!isLogin)}>
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
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">DiffGuard</p>
            <h1 className="text-2xl font-black">Review Operations</h1>
          </div>
          <button className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setToken(null)}>Sign out</button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <button className="w-full rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white" onClick={loadRepositories}>Refresh</button>
          {status === "loading" && <p className="rounded bg-white p-3 text-sm">Loading repositories...</p>}
          {status === "error" && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {repositories.length === 0 && status !== "loading" && <p className="rounded bg-white p-3 text-sm">No authorized repositories yet.</p>}
          {repositories.map((repository) => (
            <button
              key={repository.id}
              className={`w-full rounded border p-3 text-left ${selectedId === repository.id ? "border-slate-950 bg-white" : "border-slate-200 bg-white/70"}`}
              onClick={() => setSelectedId(repository.id)}
            >
              <span className="block font-semibold">{repository.fullName}</span>
              <span className="text-xs text-slate-600">{repository._count?.reviewRuns ?? 0} review runs</span>
            </button>
          ))}
        </aside>

        <section className="space-y-6">
          {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!selected ? (
            <div className="rounded border border-slate-200 bg-white p-8">Select a repository to inspect review history.</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">Runs</p><p className="text-2xl font-black">{metrics?.totalRuns ?? 0}</p></div>
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">Retry rate</p><p className="text-2xl font-black">{Math.round((metrics?.retryRate ?? 0) * 100)}%</p></div>
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">GitHub failures</p><p className="text-2xl font-black">{metrics?.githubFailureCount ?? 0}</p></div>
                <div className="rounded border bg-white p-4"><p className="text-xs text-slate-600">Skipped files</p><p className="text-2xl font-black">{metrics?.skippedFileCount ?? 0}</p></div>
              </div>

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
                      </tr>
                    </thead>
                    <tbody>
                      {pilotPrecision.map((rule) => (
                        <tr key={rule.ruleId} className="border-t">
                          <td className="p-3 font-mono text-xs">{rule.ruleId}</td>
                          <td className="p-3">{rule.totalFindings}</td>
                          <td className="p-3 text-emerald-700">{rule.confirmedCount}</td>
                          <td className="p-3 text-red-700">{rule.falsePositiveCount}</td>
                          <td className="p-3 text-slate-500">{rule.unverifiedCount}</td>
                          <td className="p-3 font-semibold">
                            {(rule.precision * 100).toFixed(1)}%
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
                <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                      <option value="ENFORCING">Enforcing</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Retention days
                    <input className="mt-1 w-full rounded border px-3 py-2" type="number" min={7} max={365} value={selected.retentionDays} onChange={(event) => void updateSettings({ retentionDays: Number(event.target.value) })} />
                  </label>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white">
                <div className="border-b p-4">
                  <h2 className="text-lg font-black">Review Runs</h2>
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
                            <td className="p-3">{run.llmState ?? "SKIPPED"}</td>
                            <td className="p-3">
                              <button className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => void rerun(run.id)}>Rerun</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-black">Save PR Evidence</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto_auto]">
                  <input className="rounded border px-3 py-2" placeholder="PR number" value={prNumber} onChange={(event) => setPrNumber(event.target.value)} />
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
