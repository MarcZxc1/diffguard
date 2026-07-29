import type { FormEvent } from "react";
import { apiPath } from "../lib/api";

export function AuthScreen({
  authError,
  email,
  isAuthenticating,
  isLogin,
  name,
  onEmailChange,
  onNameChange,
  onPasswordChange,
  onSubmit,
  onToggleMode,
  password,
}: {
  authError: string;
  email: string;
  isAuthenticating: boolean;
  isLogin: boolean;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onToggleMode: () => void;
  password: string;
}) {
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
          <form
            aria-busy={isAuthenticating}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            onSubmit={onSubmit}
          >
            <h2 className="text-xl font-bold">{isLogin ? "Sign in" : "Create account"}</h2>
            {authError && (
              <p
                aria-live="assertive"
                className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {authError}
              </p>
            )}
            {!isLogin && (
              <label className="mt-4 block text-sm font-medium">
                Name
                <input
                  autoComplete="name"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  disabled={isAuthenticating}
                  name="name"
                  onChange={(event) => onNameChange(event.target.value)}
                  required
                  value={name}
                />
              </label>
            )}
            <label className="mt-4 block text-sm font-medium">
              Email
              <input
                autoComplete="email"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                disabled={isAuthenticating}
                name="email"
                onChange={(event) => onEmailChange(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Password
              <input
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                disabled={isAuthenticating}
                name="password"
                onChange={(event) => onPasswordChange(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button
              className="mt-6 w-full rounded bg-[#0f172a] px-4 py-2 font-semibold text-white disabled:opacity-50"
              disabled={isAuthenticating}
              type="submit"
            >
              {isAuthenticating ? "Please wait…" : isLogin ? "Sign in" : "Register"}
            </button>
            <div className="mt-4 flex items-center gap-4 text-slate-400">
              <hr className="flex-1" />
              <span className="text-xs font-semibold uppercase tracking-wider">Or</span>
              <hr className="flex-1" />
            </div>
            <a
              className="mt-4 block w-full rounded border border-slate-950 bg-white px-4 py-2 text-center font-semibold text-slate-950 hover:bg-slate-50"
              href={apiPath("api/auth/github")}
            >
              Continue with GitHub
            </a>
            <button
              className="mt-6 text-sm font-semibold text-emerald-700"
              disabled={isAuthenticating}
              onClick={onToggleMode}
              type="button"
            >
              {isLogin ? "Need an account?" : "Already have an account?"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
