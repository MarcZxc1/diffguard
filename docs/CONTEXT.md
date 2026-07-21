# DiffGuard project context

## Purpose

DiffGuard is a focused GitHub pull-request security assistant. GitHub sends a signed `pull_request` webhook, the backend verifies and durably queues it, then a database-backed worker fetches every supported changed-file page, applies versioned deterministic rules, optionally runs a bounded structured LLM review for opted-in repositories, persists findings, and publishes one GitHub Check Run plus at most three idempotent inline comments. The frontend is an operations dashboard for authorized repositories, review runs, settings, metrics, retention, and curated PR evidence export.

## Stack

| Area | Choice | Why it exists |
| --- | --- | --- |
| Runtime | Bun | Runs TypeScript, scripts, and tests quickly. |
| API | Express 5 + TypeScript | Defines HTTP routes and middleware. |
| Validation | Zod | Rejects malformed environment variables and request bodies. |
| Database | PostgreSQL + Prisma 7 | Stores users and future product data. Works with Docker, local PostgreSQL, or a managed PostgreSQL service such as Supabase through a normal connection string. |
| Cache | Redis + ioredis | Caches the admin user-list response. |
| Auth | Argon2 + JWT + GitHub OAuth | Hashes fallback passwords, supports GitHub sign-in, and authenticates API requests with backend-issued JWTs. |
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
GitHub -> ngrok -> webhook -> raw-body HMAC -> durable review run -> 202
Review worker -> installation token -> Check Run -> paginated patches -> rules -> optional LLM -> findings -> idempotent comments -> Check Run summary
```

GitHub signs the **exact request bytes**, not a re-formatted JSON object. That is why the webhook router is mounted before `express.json()`: its `express.raw()` middleware must receive the untouched body before a JSON parser consumes it.

## Local setup

Use two terminals from the repository root when you want the default local Docker setup:

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

The backend only depends on a PostgreSQL connection string, so a managed PostgreSQL service such as Supabase or a locally installed PostgreSQL server can be used instead of Docker if you prefer. Docker Compose is simply the fastest local path.

Create `backend/.env` locally. Do not commit this file or paste its values into documentation:

```dotenv
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:63707
JWT_SECRET=replace-with-a-long-random-secret
GITHUB_WEBHOOK_SECRET=replace-with-the-GitHub-webhook-secret
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_PATH=/absolute/path/to/github-app.private-key.pem
GITHUB_CLIENT_ID=optional-for-github-oauth
GITHUB_CLIENT_SECRET=optional-for-github-oauth
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY=optional-32-plus-character-token-key
FRONTEND_URL=http://localhost:5173
OPENAI_API_KEY=optional-for-opted-in-llm-review
OPENAI_MODEL=gpt-5.6-sol
DIFFGUARD_DEV_ENFORCEMENT_BYPASS=false
PORT=3000
```

`FRONTEND_URL` is also the backend's exact credentialed CORS origin and OAuth callback destination. Production must set it to the deployed frontend origin rather than relying on the local default.

For a local enforcement demonstration before the advisory evidence target is met, set `NODE_ENV=development` and `DIFFGUARD_DEV_ENFORCEMENT_BYPASS=true`, then restart the backend. The dashboard keeps showing the real pilot status and labels the bypass. Startup validation rejects this flag in production.

`VITE_API_URL` is read by the frontend. It should include a trailing slash, for example `VITE_API_URL=http://localhost:3000/` in `frontend/.env`.

## Current API surface

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/health` | No | Checks whether Postgres accepts `SELECT 1`. |
| POST | `/api/auth/register` | No | Creates a user and returns a 15-minute JWT. |
| POST | `/api/auth/login` | No | Verifies credentials and returns a JWT. |
| GET | `/api/auth/github` | No | Starts GitHub OAuth with HTTP-only state and PKCE-verifier cookies. |
| POST | `/api/auth/github/link` | JWT | Starts the same protected flow with a signed, short-lived intent to link or reconnect the authenticated DiffGuard user. |
| GET | `/api/auth/github/callback` | GitHub redirect + state/PKCE cookies | Exchanges the GitHub code, links or creates the user, stores access and optional refresh tokens encrypted with expiry metadata, and redirects the browser with a short-lived one-time exchange code. |
| POST | `/api/auth/github/exchange` | One-time code | Consumes the one-time OAuth exchange code and returns the backend JWT. |
| GET | `/api/users` | Admin JWT | Returns cached user records. |
| POST | `/api/users` | Admin JWT | Creates a user from `email`, optional `name`, and a password of at least eight characters. Passwords are hashed and omitted from responses. |
| POST | `/api/webhook/github` | GitHub HMAC | Atomically queues supported `opened` and `synchronize` deliveries and returns the durable review-run ID. |
| GET | `/api/webhook/github` | No | Returns 405 because webhooks are POST-only. |
| GET | `/api/review-runs/:id` | JWT + repository manager | Returns the durable state, sanitized failure, coverage counts, and persisted findings for one run. |
| PATCH | `/api/repositories/:id/rules` | Admin JWT | Replaces a repository's validated rule configuration for future review runs. |
| GET | `/api/repositories/github/discover` | JWT + connected GitHub account | Lists GitHub App installations and repositories visible to the signed-in GitHub user, including whether DiffGuard is installed and whether the user has admin/maintain permission to connect it. |
| POST | `/api/repositories/github/connect` | JWT + GitHub admin/maintain permission | Grants the signed-in user DiffGuard manager access to an installed repository after verifying GitHub permissions. |
| GET | `/api/repositories` | JWT | Lists repositories visible to the user. Admins see all repositories; other users need a repository access grant. |
| GET | `/api/repositories/:id` | JWT + repository access | Returns settings and recent review runs for one repository. |
| PATCH | `/api/repositories/:id/settings` | JWT + repository manager | Updates enabled state, draft policy, Check Run mode, LLM opt-in/model, retention days, or rule configuration. An enforcing-mode transition requires sufficient pilot evidence. |
| GET | `/api/repositories/:id/metrics` | JWT + repository access | Returns processing, retry, GitHub failure, suppression, and skipped-coverage metrics. |
| POST | `/api/repositories/:id/ai/test` | JWT + repository manager | Sends a tiny synthetic OpenAI structured-output health request for the repository model and returns a sanitized status for dashboard toast feedback. |
| POST | `/api/repositories/:id/retention/prune` | JWT + repository manager | Deletes review runs older than the repository retention window and audits the action. |
| POST | `/api/review-runs/:id/rerun` | JWT + repository manager | Clears findings and safely requeues the existing review run. |
| POST | `/api/repositories/:id/evidence/preview` | JWT + repository manager | Fetches PR metadata with the GitHub App token and returns sanitized Markdown preview JSON. |
| POST | `/api/repositories/:id/evidence/download` | JWT + repository manager | Records an audited evidence export and returns a sanitized Markdown attachment. |
| PATCH | `/api/repositories/:id/findings/:findingId/verify` | JWT + repository manager | Marks a finding in that repository as confirmed or false positive for pilot precision measurement. |
| GET | `/api/repositories/:id/pilot/precision` | JWT + repository access | Returns confirmed, false-positive, unverified, and precision counts grouped by deterministic security rule version. |
| GET | `/api/repositories/:id/pilot/status` | JWT + repository access | Returns pilot targets, run reliability, readiness blockers, and rule versions eligible for enforcement. |

## Important boundaries

- `routes/` chooses HTTP methods, paths, and middleware.
- `controllers/` validates a request and decides the HTTP response.
- `services/` performs reusable business work, database access, and caching.
- `lib/` owns shared infrastructure clients and crypto helpers.
- `middlewares/` runs before or after handlers for auth and errors.
- `prisma/schema.prisma` is the source of truth for database models.

## Durable review behavior

- Installation, repository, delivery, review run, finding, and publication state are persisted in PostgreSQL.
- The webhook performs no GitHub API calls. A valid supported delivery returns `202` only after the delivery and queued run commit together.
- The in-process worker claims queued rows atomically. A 30-second attempt heartbeat prevents normal long-running work from being reclaimed; abandoned attempts become retryable after five minutes.
- Network, timeout, rate-limit, and GitHub 5xx failures use at most three attempts with bounded exponential backoff. Authorization, configuration, invalid-response, not-found, and stale-location failures terminate without retry.
- Failure categories and messages are sanitized. Tokens, patches, credentials, signatures, and upstream response bodies are not persisted.
- File pagination is bounded at 3,000 returned files. Hitting that bound, missing patches, deleted files, or truncated patches produces `PARTIAL`, never a clean result.
- Check Runs are created by the worker after it obtains an installation token. They move through queued, in-progress, and completed states and include bounded annotations plus a summary of analyzed files, skipped files, rules, finding counts, LLM state, and limitations.
- Finding fingerprints include the head revision, rule identity/version, file, and line. Inline comments carry an HMAC-authenticated hidden marker, allowing a retry to find an external comment after a database-write failure without letting contributors forge a predictable marker.
- LLM review is disabled by default. When repository owners opt in and `OPENAI_API_KEY` is configured, DiffGuard sends only bounded, redacted added-line context to the Responses API using strict structured output. Invalid output, unavailable OpenAI service, or invalid line locations fail open and cannot block deterministic review or webhook processing. Maintainers can test the configured OpenAI path from the dashboard; the health check sends no repository code and returns only sanitized status-level messages.
- Repository-scoped read operations require either an admin role or an explicit `GithubRepositoryAccess` grant. Material settings, rerun, retention, and evidence actions require admin or a `MANAGER`/`OWNER` repository grant and are written to `AuditLog`.
- GitHub OAuth is used only for user sign-in, repository discovery, and self-service repository connection. The browser never receives a GitHub OAuth token, and the callback does not put the backend JWT in the URL. The authorization-code flow uses state and S256 PKCE. Access and refresh tokens are encrypted separately at rest; expiring user tokens rotate shortly before expiry. A rejected refresh or GitHub API `401` clears only the matching stored grant and returns a typed re-authentication response. Only `admin` or `maintain` GitHub repository permissions can create a DiffGuard manager grant.
- Curated PR evidence export fetches authoritative PR metadata through the backend GitHub App token and returns/downloads sanitized Markdown. It does not export tokens, webhook payloads, full diffs, complete patches, suspected credential values, or private logs.
- Pilot verification is repository-bound: managers can only verify findings whose review run belongs to the selected repository, and each verification is audited.
- Pilot enforcement is fail-safe: advisory-to-enforcing transitions require recorded reliability and precision evidence, and only the qualifying deterministic rule versions can fail a security Check Run. LLM findings remain advisory.

## Repository rule configuration

Rule configuration is captured on the review run when the webhook is queued, so a retry cannot silently change rule behavior. The admin-only repository endpoint accepts this strict shape:

```json
{
  "enabledRuleIds": ["security.hardcoded-secret", "security.unsafe-sql-construction"],
  "severityThreshold": "MEDIUM",
  "ignoredPaths": ["generated/**"],
  "suppressions": [
    {
      "ruleId": "security.hardcoded-secret",
      "path": "examples/**",
      "reason": "Documented non-production example fixture"
    }
  ]
}
```

Unknown fields/rules and suppressions without a reason are rejected. Applied suppressions remain visible on persisted findings with their reason.

## Migration compatibility

Fresh environments should run `bun run db:migrate`. The repository now has a versioned baseline migration.

Existing local databases created before Phase 1 with `prisma db push` have no Prisma migration history. Back them up, apply the additive schema with `bun run db:push`, verify it, then mark `20260712090000_phase_1_2_foundation` as applied with `prisma migrate resolve`. Do not run `migrate deploy` directly against a non-empty unbaselined database; Prisma will correctly reject it with `P3005`.

## Current known gaps

- Review work runs in a durable database queue but still shares the API process. A separately deployed worker is an operational hardening step.
- Branch protection remains advisory until pilot precision and reliability evidence is recorded.
- Deterministic rules are focused heuristics, not proof of a vulnerability. Precision still needs measurement during the advisory pilot.

## Commands

| Command | Meaning |
| --- | --- |
| `bun dev` | Runs frontend and backend together from the repository root. |
| `cd backend && bun test` | Runs Bun unit tests. |
| `cd backend && bun run typecheck` | Checks backend TypeScript without emitting files. |
| `cd backend && bun run build` | Produces `backend/dist`. |
| `cd frontend && bun run build` | Type-checks and builds the client. |
| `cd backend && bun run db:push` | Applies the Prisma schema to the configured development database. |
| `cd backend && bun run db:migrate` | Applies versioned migrations to a migration-managed database. |
| `cd backend && bun run db:validate` | Validates the Prisma schema without changing a database. |

## Using the local Codex skills

This checkout cannot write to its `.codex` directory, so the source skills are versioned in `skills/`. Install a copy into your personal Codex skill directory:

```fish
mkdir -p ~/.codex/skills
cp -R skills/diffguard-development ~/.codex/skills/
cp -R skills/github-webhook-debugging ~/.codex/skills/
```

Then begin requests with `$diffguard-development` for normal work or `$github-webhook-debugging` for webhook work.
