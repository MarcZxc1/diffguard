# DiffGuard (Unified Next.js Deployment)

DiffGuard is a GitHub PR review and SAST bot with deterministic rule verification and optional LLM review.

This directory contains the unified Next.js application that combines both the frontend dashboard and backend review operations into a single deployment on **Vercel** with **Supabase** for database and authentication.

---

## Architecture Overview

- **Framework**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4
- **Runtime**: Bun 1.3+ / Node.js 20+
- **Database**: PostgreSQL (via Supabase) with Prisma 7 ORM (`@prisma/adapter-pg`)
- **Authentication**: Supabase Auth (Email + GitHub OAuth) with SSR middleware
- **Background Worker**: Vercel Cron Jobs (`/api/cron/review-worker` executing every minute)
- **Deployment Target**: Vercel

---

## Getting Started

### 1. Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your configuration:
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`: From your Supabase project settings.
- `DATABASE_URL`: Your Supabase transaction pooler connection string (Port 6543).
- `DIRECT_URL`: Your Supabase direct connection string (Port 5432, used for migrations).
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`: From your GitHub App configuration.
- `OPENAI_API_KEY`: Optional, for AI reviews.
- `CRON_SECRET`: Random string protecting the Vercel cron endpoint.

### 2. Database Migrations

Generate Prisma Client:

```bash
bun run db:generate
```

Apply migrations to your Supabase Postgres database:

```bash
bun run db:migrate
```

### 3. Development Server

Start the Next.js local server:

```bash
bun run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

1. Link your GitHub repository to a new project in [Vercel](https://vercel.com).
2. Set the **Root Directory** to `diffguard`.
3. Set the **Framework Preset** to Next.js.
4. Add all environment variables from `.env.example` in the Vercel project dashboard.
5. In your GitHub App configuration:
   - Update **Webhook URL** to: `https://<your-vercel-domain>.vercel.app/api/webhook/github`
   - Update **OAuth Callback URL** in Supabase to: `https://<your-supabase-id>.supabase.co/auth/v1/callback`
