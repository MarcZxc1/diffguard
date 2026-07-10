# DiffGuard project context

## Purpose

DiffGuard is the starting point for a GitHub pull-request analysis service. GitHub sends a signed `pull_request` webhook, the backend verifies that it really came from GitHub, then future work can queue analysis and publish a review result. The current frontend is an authentication and backend-connectivity scaffold rather than the final DiffGuard product UI.

## Stack

| Area | Choice | Why it exists |
| --- | --- | --- |
| Runtime | Bun | Runs TypeScript, scripts, and tests quickly. |
| API | Express 5 + TypeScript | Defines HTTP routes and middleware. |
| Validation | Zod | Rejects malformed environment variables and request bodies. |
| Database | PostgreSQL + Prisma 7 | Stores users and future product data. |
| Cache | Redis + ioredis | Caches the admin user-list response. |
| Auth | Argon2 + JWT | Hashes passwords and authenticates requests. |
| Client | React 19 + Vite + Tailwind CSS | Provides the browser application. |
| Local services | Docker Compose | Starts isolated Postgres and Redis containers. |

## Repository map

```text
diffguard/
  backend/       Express API, Prisma schema, Docker services
  frontend/      React/Vite browser app
  docs/          Project knowledge and operating guides
  skills/        Portable Codex skills for this repository
  package.json   Bun workspace commands
```

## Request flow

```text
React browser -> /api/auth or /api/users -> Express routes -> controllers -> Prisma / Redis
GitHub -> ngrok -> POST /api/webhook/github -> raw body -> HMAC check -> future analysis
```

GitHub signs the **exact request bytes**, not a re-formatted JSON object. That is why the webhook router is mounted before `express.json()`: its `express.raw()` middleware must receive the untouched body before a JSON parser consumes it.

## Local setup

Use two terminals from the repository root:

```fish
cd backend
docker compose up -d
bun run db:push
bun dev
```

```fish
cd frontend
bun dev
```

The API defaults to `http://localhost:3000`; Vite normally serves the client at `http://localhost:5173`.

Create `backend/.env` locally. Do not commit this file or paste its values into documentation:

```dotenv
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:63707
JWT_SECRET=replace-with-a-long-random-secret
GITHUB_WEBHOOK_SECRET=replace-with-the-GitHub-webhook-secret
PORT=3000
```

`VITE_API_URL` is read by the frontend. It should include a trailing slash, for example `VITE_API_URL=http://localhost:3000/` in `frontend/.env`.

## Current API surface

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/health` | No | Checks whether Postgres accepts `SELECT 1`. |
| POST | `/api/auth/register` | No | Creates a user and returns a 15-minute JWT. |
| POST | `/api/auth/login` | No | Verifies credentials and returns a JWT. |
| GET | `/api/users` | Admin JWT | Returns cached user records. |
| POST | `/api/users` | Admin JWT | Intended to create a user; see known issue below. |
| POST | `/api/webhook/github` | GitHub HMAC | Accepts `opened` and `synchronize` pull-request events and records delivery IDs to prevent duplicate processing. |
| GET | `/api/webhook/github` | No | Returns 405 because webhooks are POST-only. |

## Important boundaries

- `routes/` chooses HTTP methods, paths, and middleware.
- `controllers/` validates a request and decides the HTTP response.
- `services/` performs reusable business work, database access, and caching.
- `lib/` owns shared infrastructure clients and crypto helpers.
- `middlewares/` runs before or after handlers for auth and errors.
- `prisma/schema.prisma` is the source of truth for database models.

## Current known gaps

- `bun run typecheck` fails in `backend/src/services/user.service.ts`: the Prisma `User` model requires `password`, but the admin create-user DTO only supplies `email` and optional `name`. Decide whether admins should supply a password, generate an invitation/reset flow, or remove this endpoint before fixing the contract.
- The webhook records accepted delivery IDs and logs an accepted PR, but does not yet fetch a diff, enqueue a job, or post a GitHub check/review.
- The frontend is a starter authentication screen. It does not yet expose DiffGuard repositories, analyses, findings, or settings.
- Redis starts during module import. Add connection error handling and a shutdown path before production deployment.

## Commands

| Command | Meaning |
| --- | --- |
| `bun dev` | Runs frontend and backend together from the repository root. |
| `cd backend && bun test` | Runs Bun unit tests. |
| `cd backend && bun run typecheck` | Checks backend TypeScript without emitting files. |
| `cd backend && bun run build` | Produces `backend/dist`. |
| `cd frontend && bun run build` | Type-checks and builds the client. |
| `cd backend && bun run db:push` | Applies the Prisma schema to the configured development database. |

## Using the local Codex skills

This checkout cannot write to its `.codex` directory, so the source skills are versioned in `skills/`. Install a copy into your personal Codex skill directory:

```fish
mkdir -p ~/.codex/skills
cp -R skills/diffguard-development ~/.codex/skills/
cp -R skills/github-webhook-debugging ~/.codex/skills/
```

Then begin requests with `$diffguard-development` for normal work or `$github-webhook-debugging` for webhook work.
