"use client";

import type { FormEvent } from "react";
import { apiPath } from "@/lib/api";
import { GithubIcon, ShieldIcon } from "./Icons";

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
    <main className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-2xs mb-3">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">DiffGuard</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {isLogin ? "Sign in to review operations" : "Create your DiffGuard account"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-2xs">
          {authError && (
            <div
              aria-live="assertive"
              className="mb-4 rounded border border-rose-200 bg-rose-50/60 p-2.5 text-xs text-rose-800"
              role="alert"
            >
              {authError}
            </div>
          )}

          <form
            aria-busy={isAuthenticating}
            className="space-y-3.5 text-xs"
            onSubmit={onSubmit}
          >
            {!isLogin && (
              <div>
                <label className="block font-medium text-zinc-700">Name</label>
                <input
                  autoComplete="name"
                  className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-hidden disabled:opacity-50"
                  disabled={isAuthenticating}
                  name="name"
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Your Name"
                  required
                  value={name}
                />
              </div>
            )}

            <div>
              <label className="block font-medium text-zinc-700">Email</label>
              <input
                autoComplete="email"
                className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-hidden disabled:opacity-50"
                disabled={isAuthenticating}
                name="email"
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="name@company.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700">Password</label>
              <input
                autoComplete={isLogin ? "current-password" : "new-password"}
                className="mt-1.5 w-full rounded border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-hidden disabled:opacity-50"
                disabled={isAuthenticating}
                name="password"
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••••••"
                required
                type="password"
                value={password}
              />
            </div>

            <button
              className="w-full rounded bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 transition disabled:opacity-50"
              disabled={isAuthenticating}
              type="submit"
            >
              {isAuthenticating
                ? "Connecting..."
                : isLogin
                ? "Sign In"
                : "Create Account"}
            </button>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider text-zinc-400">
                <span className="bg-white px-2">Or</span>
              </div>
            </div>

            <a
              className="flex w-full items-center justify-center gap-2 rounded border border-zinc-200 bg-white py-2 font-medium text-zinc-700 hover:bg-zinc-50 transition"
              href={apiPath("api/auth/github")}
            >
              <GithubIcon className="h-3.5 w-3.5" />
              <span>Continue with GitHub</span>
            </a>

            <div className="pt-2 text-center">
              <button
                className="text-xs text-zinc-500 hover:text-zinc-900 transition"
                disabled={isAuthenticating}
                onClick={onToggleMode}
                type="button"
              >
                {isLogin
                  ? "Need an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
