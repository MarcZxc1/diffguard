# Code walkthrough

This guide explains the role of every maintained source file. Read the source beside this guide; comments in the code call out the parts that are easy to get subtly wrong.

## Root workspace

- `package.json`: declares `backend` and `frontend` as Bun workspaces. Its `dev` script runs both development servers through `concurrently`.
- `bun.lock`: locks dependency versions so installations are reproducible. Do not edit it manually.

## Backend configuration and data

- `backend/package.json`: API scripts and dependencies. `bun dev` watches `src/index.ts`; `bun test` discovers `*.test.ts`; `typecheck` runs TypeScript only.
- `backend/tsconfig.json`: strict TypeScript settings. `noEmit` makes this configuration a verifier rather than a compiler.
- `backend/.env`: local secrets and connection strings. It is deliberately not documented with real values and must not be committed.
- `backend/prisma.config.ts`: tells Prisma where the schema is and which connection URL to use for CLI commands.
- `backend/prisma/schema.prisma`: defines users plus GitHub OAuth identity/token state, one-time OAuth login exchanges, durable GitHub installations, repositories, access grants, deliveries, review runs, findings, Check Run state, LLM state, audit logs, evidence exports, state/failure enums, repository rule configuration, retry scheduling, and idempotent fingerprint constraints.
- `backend/prisma/migrations/20260712090000_phase_1_2_foundation/migration.sql`: creates the complete migration-managed schema and additively extends a Phase 0 delivery table when present.
- `backend/prisma/migrations/20260712110000_phase_3_5_review_experience/migration.sql`: additively adds Check Run, LLM, authorization, audit, retention, and PR evidence export state.
- `backend/prisma/migrations/20260712140000_phase_7_oauth/migration.sql`: adds GitHub OAuth user linking, encrypted-token storage, and one-time OAuth login exchange state. It drops the earlier plaintext OAuth token column if a local database had it from the unsafe draft implementation.
- `backend/docker-compose.yml`: starts Postgres on host port `54519` and Redis on host port `63707`. The services retain data in named Docker volumes.

## Backend entry point and environment

- `backend/src/app.ts`: constructs the Express application and mounts its middleware and routers. The webhook router stays above `express.json()` so it gets the original bytes for HMAC validation.
- `backend/src/app.test.ts`: invokes the route boundary with controlled requests and verifies webhook responses, exact-byte signature handling, raw-body middleware ordering, fast durable enqueue, duplicates, and enqueue failure without calling GitHub.
- `backend/src/index.ts`: connects Postgres and Redis, starts the HTTP server and durable review worker, and handles `SIGINT`/`SIGTERM` by draining the worker before closing the server and infrastructure clients.
- `backend/src/env.ts`: loads `.env` and validates the variables this application requires. Zod converts `PORT` to a number and supplies development defaults.
- `backend/src/lib/prisma.ts`: creates a Postgres connection pool, gives it to Prisma's driver adapter, and caches the Prisma client on `global` during development to avoid repeatedly creating clients after reloads.
- `backend/src/lib/redis.ts`: creates the shared lazy Redis client. Startup connects it explicitly so import-time failures do not create unmanaged sockets.
- `backend/src/lib/infrastructure.ts`: coordinates Postgres/Redis startup, rolls back Postgres when Redis cannot connect, and attempts all applicable cleanup during shutdown.
- `backend/src/lib/infrastructure.test.ts`: verifies infrastructure ordering, startup rollback, and active-client cleanup with fakes.
- `backend/src/lib/github-app.ts`: loads the App PEM key from configuration or a protected path, creates short-lived RS256 GitHub App JWTs, and exchanges them for installation access tokens. It validates IDs and GitHub responses without logging or exposing token values.
- `backend/src/lib/wait-for-postgres.ts`: is run before `prisma db push` to wait for the Docker database to become available.

## HTTP routing

- `backend/src/routes/health.routes.ts`: exposes `GET /api/health`; `SELECT 1` is the smallest useful database probe.
- `backend/src/routes/auth.routes.ts`: maps registration, login, GitHub OAuth start/callback, and one-time OAuth exchange URLs to controller functions.
- `backend/src/routes/user.routes.ts`: protects both user endpoints with JWT authentication and an `ADMIN` role check before the controller runs.
- `backend/src/routes/github-webhooks.routes.ts`: verifies the exact raw-body HMAC, validates the supported pull-request payload with Zod, handles opened/synchronize/reopened/ready-for-review actions, and delegates one atomic durable enqueue or configured draft skip. It returns `202` without authenticating to GitHub or scanning patches. Duplicates report the existing run state rather than pretending a failed run succeeded.
- `backend/src/routes/review-run.routes.ts`: exposes one sanitized review run and manual rerun behavior to users authorized for the repository.
- `backend/src/routes/repository.routes.ts`: exposes GitHub repository discovery/connection plus authorized repository listing, detail, settings, metrics, retention prune, rule configuration, PR evidence export, pilot finding verification, and pilot precision endpoints.

## Controllers, services, and middleware

- `backend/src/controllers/auth.controller.ts`: Zod validates request JSON, Argon2 hashes or verifies passwords, starts GitHub OAuth with state protection, exchanges GitHub codes, links or creates OAuth users, records one-time login exchange codes, and signs backend JWTs. Login intentionally uses the same error for an unknown email and wrong password so callers cannot enumerate accounts.
- `backend/src/controllers/user.controller.ts`: validates the admin create-user body and delegates all data work to `userService`.
- `backend/src/services/user.service.ts`: caches a public projection of the user list for 60 seconds. Admin creation hashes the required password, persists it, returns only public fields, and removes the cache so the next list is fresh.
- `backend/src/services/user.service.test.ts`: verifies that the admin-supplied password is transformed before persistence.
- `backend/src/services/github-webhook-delivery.service.ts`: transactionally upserts installation/repository identity and creates a unique delivery plus queued review run. It respects enabled state, returns the current state for duplicates, and atomically requeues a recorded retryable failure when attempts remain.
- `backend/src/services/review-worker.ts`: polls the durable queue, atomically claims one due run, heartbeats the attempt, recovers abandoned work, and delegates processing. Attempt-count guards prevent an expired worker from overwriting a newer claim.
- `backend/src/services/review-processor.ts`: exchanges the installation token, publishes Check Run lifecycle state, fetches/assesses patches, runs the configuration snapshot, optionally runs fail-open structured LLM review, persists findings, deduplicates bounded comments, completes clean/partial runs, and records bounded retry or sanitized terminal failure state.
- `backend/src/services/llm-review.service.ts`: builds bounded redacted added-line context, calls the OpenAI Responses API only for opted-in repositories with credentials configured, validates strict structured output with Zod, rejects invalid locations, fails open, and exposes a synthetic no-code OpenAI health check for dashboard testing.
- `backend/src/services/review-run.service.ts`: selects the public operational view of a review run and converts GitHub bigint IDs to JSON-safe strings.
- `backend/src/services/repository.service.ts`: validates and persists repository settings, rule configuration, metrics, manual reruns, retention pruning, and repository dashboard projections including sanitized LLM failure messages.
- `backend/src/services/repository-authorization.service.ts`: centralizes repository access checks and audit-log recording.
- `backend/src/services/oauth-token.service.ts`: encrypts user GitHub OAuth tokens with AES-256-GCM and hashes short-lived OAuth exchange codes so raw credentials or exchange codes are not stored.
- `backend/src/services/github-permissions.service.ts`: converts GitHub repository permissions into DiffGuard onboarding decisions. Self-service connection requires `admin` or `maintain`, because connecting grants manager-level dashboard access.
- `backend/src/services/evidence-export.service.ts`: fetches authoritative PR metadata with the GitHub App token and produces sanitized Markdown previews/downloads without exporting patches, secrets, or private logs.
- `backend/src/services/pilot.service.ts`: records repository-bound finding verification decisions and computes advisory pilot precision grouped by rule.
- `backend/src/services/pilot-gate.service.ts`: keeps the future enforcement decision pure by requiring both minimum precision and minimum verified sample size.
- `backend/src/middlewares/auth.middleware.ts`: reads `Authorization: Bearer <JWT>`, verifies it, and saves the token subject and role on the request. `requireRole` runs after it and rejects unsuitable roles.
- `backend/src/middlewares/error.middleware.ts`: turns known `HttpError` instances into intentional client responses. Unknown errors are logged only on the server and return a generic 500 response.

## GitHub signature code

- `backend/src/lib/github-webhook.ts`: computes `HMAC-SHA256(secret, rawBody)`, compares it to the header after `sha256=`, and uses `timingSafeEqual` only after checking equal buffer lengths. This prevents malformed headers from throwing and avoids a timing side channel.
- `backend/src/lib/github-webhook.test.ts`: creates a signature using the same crypto primitive and verifies acceptance/rejection cases. These tests protect the raw signature contract.
- `backend/src/lib/github-app.test.ts`: verifies App JWT claims/signing, installation-token request headers, and failed or malformed GitHub responses using a mocked fetch.
- `backend/src/lib/diff-parser.ts`: maps unified patch hunks to added, removed, and context lines with new-file line numbers.
- `backend/src/lib/github-review.ts`: follows bounded file/comment pagination, validates and size-bounds GitHub responses, detects incomplete patch coverage, finds HMAC-authenticated fingerprint markers, posts right-side review comments, creates/updates Check Runs, fetches PR metadata for evidence export, and uses request timeouts.
- `backend/src/services/rule-engine.ts`: defines the versioned deterministic rule contract, configuration schema, path/severity/suppression controls, stable fingerprints, seven security rule families, and one separate repository-policy rule.
- `backend/src/lib/github-review.test.ts`: verifies multi-page files, pagination limits, patch coverage, external comment deduplication, publication payloads, and markers with mocked HTTP.
- `backend/src/services/github-webhook-delivery.service.test.ts`: verifies atomic enqueue ordering, disabled repositories, and retrying a recorded failure.
- `backend/src/services/review-processor.test.ts`: verifies partial coverage, sanitized failure classification, backoff, and attempt exhaustion.
- `backend/src/services/rule-engine.test.ts`: provides positive, negative, removed-line boundary, redaction, policy, configuration, suppression, and fingerprint fixtures.
- `backend/src/payload.json`: a sample pull-request payload. Treat it as bytes when generating a local signature; reformatting it changes the signature.
- `backend/scripts/test-github-webhook.fish`: creates a signed local webhook request from the sample payload, so manual testing does not depend on copying a multiline curl command correctly.

## Frontend

- `frontend/package.json`: Vite development, build, preview, and Oxlint commands.
- `frontend/vite.config.ts`: configures Vite and the React plugin.
- `frontend/tsconfig*.json`: separates browser TypeScript settings from Vite/Node configuration.
- `frontend/index.html`: Vite's HTML shell; `#root` is where React renders.
- `frontend/src/main.tsx`: creates the React root and wraps the app in `StrictMode`, which helps surface unsafe development behavior.
- `frontend/src/App.tsx`: exchanges GitHub OAuth callback codes for backend JWTs, stores the JWT in `localStorage`, renders login/register/GitHub sign-in, lists and connects authorized repositories, shows review-run states, metrics, pilot precision, updates repository settings, triggers reruns, and previews/downloads sanitized PR evidence Markdown.
- `frontend/src/index.css`: imports Tailwind CSS.
- `frontend/src/App.css`: leftover Vite starter styles. `App.tsx` uses Tailwind utility classes instead, so remove this file and import only when the final UI no longer needs it.
- `frontend/src/assets/*` and `frontend/public/*`: starter images/icons; preserve only assets used by the final product.

## How to read a request end-to-end

For `POST /api/auth/login`:

```text
App.tsx fetch -> auth.routes.ts -> login controller -> Zod -> Prisma -> Argon2 -> JWT -> JSON response
```

For `POST /api/webhook/github`:

```text
ngrok -> raw router -> HMAC -> Zod payload -> transactionally queued delivery/run -> 202
review worker -> atomic claim -> Check Run queued/in-progress -> GitHub pages -> coverage -> rule snapshot -> optional LLM -> findings/comments -> Check Run summary -> terminal state
```
