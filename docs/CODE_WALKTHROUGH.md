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
- `backend/prisma/schema.prisma`: defines the `User` table and `Role` enum, plus `GithubWebhookDelivery`. User `email` is unique, `password` is required, and timestamps are database-managed. A webhook `deliveryId` is unique so GitHub retries cannot start duplicate reviews.
- `backend/docker-compose.yml`: starts Postgres on host port `54519` and Redis on host port `63707`. The services retain data in named Docker volumes.

## Backend entry point and environment

- `backend/src/app.ts`: constructs the Express application and mounts its middleware and routers. The webhook router stays above `express.json()` so it gets the original bytes for HMAC validation.
- `backend/src/app.test.ts`: starts the application on an ephemeral port and verifies webhook HTTP responses, exact-byte signature handling, and raw-body middleware ordering without calling GitHub.
- `backend/src/index.ts`: connects Postgres and Redis, starts the HTTP server, and handles `SIGINT`/`SIGTERM` by closing the server and infrastructure clients.
- `backend/src/env.ts`: loads `.env` and validates the variables this application requires. Zod converts `PORT` to a number and supplies development defaults.
- `backend/src/lib/prisma.ts`: creates a Postgres connection pool, gives it to Prisma's driver adapter, and caches the Prisma client on `global` during development to avoid repeatedly creating clients after reloads.
- `backend/src/lib/redis.ts`: creates the shared lazy Redis client. Startup connects it explicitly so import-time failures do not create unmanaged sockets.
- `backend/src/lib/infrastructure.ts`: coordinates Postgres/Redis startup, rolls back Postgres when Redis cannot connect, and attempts all applicable cleanup during shutdown.
- `backend/src/lib/infrastructure.test.ts`: verifies infrastructure ordering, startup rollback, and active-client cleanup with fakes.
- `backend/src/lib/github-app.ts`: loads the App PEM key from configuration or a protected path, creates short-lived RS256 GitHub App JWTs, and exchanges them for installation access tokens. It validates IDs and GitHub responses without logging or exposing token values.
- `backend/src/lib/wait-for-postgres.ts`: is run before `prisma db push` to wait for the Docker database to become available.

## HTTP routing

- `backend/src/routes/health.routes.ts`: exposes `GET /api/health`; `SELECT 1` is the smallest useful database probe.
- `backend/src/routes/auth.routes.ts`: maps registration and login URLs to controller functions.
- `backend/src/routes/user.routes.ts`: protects both user endpoints with JWT authentication and an `ADMIN` role check before the controller runs.
- `backend/src/routes/github-webhooks.routes.ts`: receives GitHub's POST request. It checks the HMAC before parsing JSON, requires a delivery id and valid installation ID, filters for `pull_request`, authenticates the installation, fetches patches, runs the first deterministic rule, and posts up to three inline comments. It records the delivery before analysis; a repeated ID returns `200` without processing again.

## Controllers, services, and middleware

- `backend/src/controllers/auth.controller.ts`: Zod validates request JSON, Argon2 hashes or verifies passwords, Prisma looks up or writes the user, and `jsonwebtoken` signs a short-lived JWT. Login intentionally uses the same error for an unknown email and wrong password so callers cannot enumerate accounts.
- `backend/src/controllers/user.controller.ts`: validates the admin create-user body and delegates all data work to `userService`.
- `backend/src/services/user.service.ts`: caches a public projection of the user list for 60 seconds. Admin creation hashes the required password, persists it, returns only public fields, and removes the cache so the next list is fresh.
- `backend/src/services/user.service.test.ts`: verifies that the admin-supplied password is transformed before persistence.
- `backend/src/services/github-webhook-delivery.service.ts`: records supported webhook deliveries. Its duplicate-skipping insert makes concurrent retries idempotent without treating normal retry traffic as a database error; unrelated database failures still fail the request.
- `backend/src/middlewares/auth.middleware.ts`: reads `Authorization: Bearer <JWT>`, verifies it, and saves the token subject and role on the request. `requireRole` runs after it and rejects unsuitable roles.
- `backend/src/middlewares/error.middleware.ts`: turns known `HttpError` instances into intentional client responses. Unknown errors are logged only on the server and return a generic 500 response.

## GitHub signature code

- `backend/src/lib/github-webhook.ts`: computes `HMAC-SHA256(secret, rawBody)`, compares it to the header after `sha256=`, and uses `timingSafeEqual` only after checking equal buffer lengths. This prevents malformed headers from throwing and avoids a timing side channel.
- `backend/src/lib/github-webhook.test.ts`: creates a signature using the same crypto primitive and verifies acceptance/rejection cases. These tests protect the raw signature contract.
- `backend/src/lib/github-app.test.ts`: verifies App JWT claims/signing, installation-token request headers, and failed or malformed GitHub responses using a mocked fetch.
- `backend/src/lib/diff-parser.ts`: maps unified patch hunks to added, removed, and context lines with new-file line numbers.
- `backend/src/lib/github-review.ts`: fetches pull request files and posts review comments on a specific commit/path/line without exposing installation tokens.
- `backend/src/services/rule-engine.ts`: runs deterministic security checks against added lines. The first MVP check detects likely hardcoded secrets.
- `backend/src/lib/github-review.test.ts`: verifies GitHub file requests, inline-comment payloads, and human-readable finding formatting with mocked fetches.
- `backend/src/services/github-webhook-delivery.service.test.ts`: verifies that new deliveries are registered, duplicate delivery IDs become no-ops, and database failures are not swallowed.
- `backend/src/payload.json`: a sample pull-request payload. Treat it as bytes when generating a local signature; reformatting it changes the signature.
- `backend/scripts/test-github-webhook.fish`: creates a signed local webhook request from the sample payload, so manual testing does not depend on copying a multiline curl command correctly.

## Frontend

- `frontend/package.json`: Vite development, build, preview, and Oxlint commands.
- `frontend/vite.config.ts`: configures Vite and the React plugin.
- `frontend/tsconfig*.json`: separates browser TypeScript settings from Vite/Node configuration.
- `frontend/index.html`: Vite's HTML shell; `#root` is where React renders.
- `frontend/src/main.tsx`: creates the React root and wraps the app in `StrictMode`, which helps surface unsafe development behavior.
- `frontend/src/App.tsx`: holds the temporary login/register form, stores the JWT in `localStorage`, calls the health endpoint, and tries the admin-only users endpoint. Its `any[]` user state and string-based status checks are starter-code compromises to replace with typed API models.
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
ngrok -> index.ts mounts raw router -> github-webhooks.routes.ts -> github-webhook.ts HMAC -> JSON parse -> action filter -> 200 acknowledgement
```
