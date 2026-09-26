"use client";

import type { FormEvent } from "react";
import { apiPath } from "@/lib/api";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  GithubIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
} from "./Icons";

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
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.1fr_420px]">
          {/* Left Brand & Value Proposition Column */}
          <div className="space-y-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                <ShieldIcon className="h-6 w-6" />
              </div>
              <span className="text-xl font-black tracking-tight text-slate-950">DiffGuard</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black leading-tight tracking-tight text-slate-950">
              High-Precision GitHub PR Review & SecOps Gate.
            </h1>

            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Deterministic AST security scanners, AI-powered reasoning, and pilot accuracy gates that guarantee
              zero false-positive disruption to developer velocity.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero false-positive enforcement gate (requires 90%+ precision qualification)</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Deterministic rules for SQL injection, command exec, CORS, and auth bypass</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Cryptographically anchored PR evidence artifacts for SOC2 compliance</span>
              </div>
            </div>
          </div>

          {/* Right Auth Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">
              {isLogin ? "Sign in to workspace" : "Create your account"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isLogin
                ? "Enter your credentials to access review operations"
                : "Get started with automated PR security reviews"}
            </p>

            {authError && (
              <div
                aria-live="assertive"
                className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"
                role="alert"
              >
                <AlertCircleIcon className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{authError}</span>
              </div>
            )}

            <form
              aria-busy={isAuthenticating}
              className="mt-5 space-y-4"
              onSubmit={onSubmit}
            >
              {!isLogin && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Full Name
                  </label>
                  <input
                    autoComplete="name"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-hidden disabled:opacity-50"
                    disabled={isAuthenticating}
                    name="name"
                    onChange={(event) => onNameChange(event.target.value)}
                    placeholder="Jane Doe"
                    required
                    value={name}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Email Address
                </label>
                <input
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-hidden disabled:opacity-50"
                  disabled={isAuthenticating}
                  name="email"
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="name@company.com"
                  required
                  type="email"
                  value={email}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Password
                </label>
                <input
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-hidden disabled:opacity-50"
                  disabled={isAuthenticating}
                  name="password"
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="••••••••••••"
                  required
                  type="password"
                  value={password}
                />
              </div>

              <button
                className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-800 focus:ring-2 focus:ring-slate-900 focus:outline-hidden disabled:opacity-50"
                disabled={isAuthenticating}
                type="submit"
              >
                {isAuthenticating
                  ? "Authenticating..."
                  : isLogin
                  ? "Sign In"
                  : "Create Account"}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="bg-white px-2">Or continue with</span>
                </div>
              </div>

              <a
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2 text-xs font-bold text-slate-800 shadow-2xs transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
                href={apiPath("api/auth/github")}
              >
                <GithubIcon className="h-4 w-4" />
                <span>Continue with GitHub</span>
              </a>

              <div className="pt-2 text-center">
                <button
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
                  disabled={isAuthenticating}
                  onClick={onToggleMode}
                  type="button"
                >
                  {isLogin
                    ? "Don't have an account? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
