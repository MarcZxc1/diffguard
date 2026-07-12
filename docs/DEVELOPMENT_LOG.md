# Development Log

## 2026-07-12

### Phase 7.1 dashboard observability and AI operations

- Added a roadmap section for dashboard observability and AI review operations.
- Planned near-realtime review-run updates, richer frontend LLM state, sanitized LLM failure reasons, a manager-only OpenAI health-test button, toast results, and a clear boundary that PR comments should be reserved for validated actionable findings rather than AI infrastructure failures.
- Added bounded polling for the selected repository so active review runs update without manual refresh.
- Exposed sanitized `llmFailureMessage` values in the repository dashboard and kept OpenAI raw response bodies out of persisted/frontend data.
- Added `POST /api/repositories/:id/ai/test` for repository managers. The endpoint sends a tiny synthetic structured-output OpenAI request, records an audit log, and returns a safe status for the frontend toast.
- Added a dashboard **Test AI Review** button with success/error toast feedback.
- Labeled LLM-origin inline review comments as AI-assisted structured review comments while keeping infrastructure failures out of PR comments.

### Phase 7.1 verification

- `cd backend && bun test src/services/llm-review.service.test.ts`: 4 passing, 0 failing.
- `cd backend && bun run typecheck`: passing.
- `cd backend && bun run build`: passing.
- `cd backend && bun test`: 94 passing, 0 failing.
- `cd frontend && bun run build`: passing.
- `git diff --check`: passing.

### Phase 7 GitHub OAuth and self-service repository connection

- Added direct GitHub OAuth sign-in with state-cookie validation, verified-email lookup, GitHub identity linking, and backend-issued JWT sessions.
- Replaced the unsafe callback URL JWT with a short-lived one-time backend exchange code.
- Added encrypted-at-rest storage for user GitHub OAuth tokens and dropped any earlier plaintext OAuth token column during migration.
- Added repository discovery through the signed-in user's GitHub App installations and a self-service connect endpoint.
- Required GitHub `admin` or `maintain` permission before granting DiffGuard `MANAGER` repository access.
- Updated the frontend with GitHub sign-in, OAuth code exchange, repository discovery, and disabled states for repositories that are not installed or not connectable.

### Phase 7 verification

- `cd backend && bun run db:generate`: passing.
- `cd backend && bun run db:validate`: passing.
- `cd backend && bun test`: 91 passing, 0 failing.
- `cd backend && bun run typecheck`: passing.
- `cd backend && bun run build`: passing.
- `cd frontend && bun run build`: passing.

### Phase 6 pilot hardening

- Bound pilot finding verification to the repository in the URL so managers cannot verify findings from another repository by ID.
- Changed evidence export sanitization coverage to import the production sanitizer instead of a duplicated test helper.
- Cleared stale frontend repository and precision state when repository loading fails.

### Phase 3-5 review experience, LLM opt-in, dashboard, and operations

- Added additive schema and migration support for Check Run state, LLM review state, repository settings, repository access grants, audit logs, retention, and PR evidence exports.
- Added GitHub Check Run create/update support with queued, in-progress, success, partial, skipped, and failed summaries plus bounded annotations.
- Added safe handling for `pull_request.reopened` and `pull_request.ready_for_review`, draft PR skip policy, and manual rerun of existing review runs.
- Added optional structured LLM review using the OpenAI Responses API, strict JSON schema output, Zod validation, bounded/redacted added-line context, invalid-location rejection, deterministic fingerprints, dedupe, and fail-open behavior.
- Added repository-scoped APIs for authorized repository listing/detail, settings, metrics, retention pruning, reruns, and curated PR evidence preview/download.
- Replaced the starter frontend with an operations dashboard for repositories, review states, metrics, settings, reruns, and sanitized Markdown evidence export.
- Added `docs/OPERATIONS.md` with migrations, health checks, backups, retention, GitHub App permissions, LLM opt-in, and evidence export guidance.

### Phase 3-5 verification

- `cd backend && bun test`: 71 passing, 0 failing.
- `cd backend && bun run typecheck`: passing.
- `cd backend && bun run build`: passing.
- `cd backend && bun run db:validate`: passing.
- `cd frontend && bun run build`: passing.

### Remaining exit evidence

- Required branch protection remains disabled until the advisory pilot proves reliability and precision.
- Phase 6 still needs real-repository pilot evidence, confirmed findings, false-positive measurement, and selected exported PR records.

### Phase 1 reliable review processing

- Added versioned persistence for GitHub installations/repositories, delivery and review-run lifecycle, attempts, sanitized failures, coverage metrics, findings, suppressions, and comment publication.
- Changed the webhook contract from synchronous GitHub work to atomic durable enqueue followed by `202`.
- Added an attempt-scoped database worker with atomic claims, heartbeats, abandoned-run recovery, three bounded attempts, and sanitized terminal states.
- Added paginated pull-request file fetching, request timeouts, missing/deleted/truncated patch detection, and explicit `PARTIAL` completion.
- Added revision-stable finding fingerprints and hidden GitHub comment markers so retries can recover an externally posted comment after a database-write failure.
- Added an admin-only review-run endpoint for observable state and sanitized findings.

### Phase 2 deterministic scanner framework

- Added a versioned rule contract with category, supported files, severity, confidence, redacted evidence, explanation, remediation, and fingerprint inputs.
- Added focused hardcoded-secret, unsafe-SQL, dynamic-command, untrusted-path, explicit-auth-bypass, permissive-CORS, and unvalidated-request-write rules.
- Added a separate missing-tests repository-policy rule.
- Added strict repository configuration for enabled rules, severity threshold, ignored paths, and reasoned scoped suppressions; each run snapshots the configuration it was queued with.
- Added admin-only repository rule configuration and positive, negative, removed-line boundary, redaction, suppression, policy, and fingerprint fixtures.

### Phase 1–2 migration verification

- Prisma schema validation passed.
- Applied the versioned migration to an isolated clean PostgreSQL database.
- Prisma migration diff reported no difference from `schema.prisma`.
- Removed the temporary validation database without modifying the existing pre-migration development database.

### Phase 1–2 verification and review

- `cd backend && bun test`: 62 passing, 0 failing.
- `cd backend && bun run typecheck`: passing.
- `cd backend && bun run build`: passing.
- `cd backend && bun run db:validate`: passing.
- `cd frontend && bun run build`: passing.
- A real isolated-database smoke test queued one delivery and verified its replay returned the same review-run ID and state.
- Senior review fixed forgeable plain comment markers, repository-name reuse conflicts, stale-worker heartbeat races, ineffective rate-limit delays, unsupported-file scanning, malformed upstream JSON handling, and a lingering startup error listener.

### Remaining exit evidence

- Phase 2 precision must be measured during a non-blocking advisory pilot before any rule becomes blocking.

### Phase 0 foundation stabilization

- Made the admin create-user contract require a password of at least eight characters, hash it with Argon2, and exclude password hashes from user list/create responses.
- Extracted Express application construction from process startup so HTTP behavior can be tested without connecting to external services.
- Added route-level webhook coverage for GET, raw-body signature ordering, invalid signatures, malformed JSON, missing delivery IDs, and ignored actions.
- Added explicit Postgres/Redis startup and graceful `SIGINT`/`SIGTERM` shutdown behavior, including startup rollback and focused lifecycle tests.
- Added GitHub Actions checks for backend tests, backend typecheck/build, and frontend build.
- Documented minimum GitHub App permissions and supported webhook events/actions.

### Verification

- `cd backend && bun test`: 29 passing, 0 failing.
- `cd backend && bun run typecheck`: passing.
- `cd backend && bun run build`: passing.
- `cd frontend && bun run build`: passing.
- GitHub Actions is configured to run the same checks for every pull request and push to `main`; the first remote run still requires pushing the Phase 0 commit.

## 2026-07-11

### Completed

- Installed the `diffguard-development` and `github-webhook-debugging` Codex skills.
- Initialized the Git repository, added a safe root `.gitignore` and README, and configured the `main` branch and GitHub remote.
- Corrected the initial commit author identity to `MarcZxc1` and amended the message to `Add DiffGuard MVP webhook foundation`.
- Implemented Phase 1 webhook delivery protection:
  - Raw HMAC SHA-256 verification remains before JSON parsing.
  - Only `pull_request.opened` and `pull_request.synchronize` are accepted.
  - Delivery IDs are persisted with a database uniqueness constraint.
  - Duplicate deliveries return `200 Webhook already processed`.
- Implemented Phase 2 GitHub App authentication:
  - Short-lived RS256 App JWTs.
  - Installation access-token exchange.
  - Installation ID validation.
  - PEM private-key loading from `GITHUB_APP_PRIVATE_KEY_PATH`.
- Implemented the first review-comment slice:
  - Fetches pull-request files and patches.
  - Maps unified-diff lines to new-file line numbers.
  - Detects likely hardcoded secrets on added lines.
  - Posts focused inline comments with severity, confidence, explanation, and a suggested fix.
  - Limits output to three findings and prevents duplicate delivery processing.
- Added Fish-based webhook testing at `backend/scripts/test-github-webhook.fish` so signed requests do not depend on copying multiline curl commands correctly.
- Updated project context, walkthrough, and webhook testing documentation.

### Verification

- Backend test suite: 18 tests passing.
- Backend build: passing.
- Local real GitHub webhook delivery received successfully with a real installation ID.
- PostgreSQL delivery persistence verified.
- The only remaining typecheck failure is the documented pre-existing admin user-create contract where `User.password` is required but not supplied.

### Current scope

The bot currently performs one deterministic check: likely hardcoded secrets. Review findings are not yet persisted as review-run records, and no LLM review is connected yet.

## Next plan

1. Add deterministic SQL injection detection with safe handling for raw SQL interpolation and unsafe Prisma APIs.
2. Add unsafe-auth, insecure-CORS, command-injection, path-traversal, missing-validation, and missing-tests rules.
3. Persist installations, repositories, review runs, findings, and posted comments in PostgreSQL.
4. Add comment idempotency and retry-safe review processing so failed GitHub API calls can be retried without duplicate comments.
5. Add the structured LLM review engine with Zod validation, confidence filtering, and a three-comment limit.
6. Add the basic reviews/repositories dashboard.
7. Add GitHub Actions CI and resolve the existing admin user-create type mismatch.

Maintainability and variable-naming suggestions should remain low-severity, repository-aware feedback rather than universal security findings.
