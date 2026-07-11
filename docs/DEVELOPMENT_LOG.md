# Development Log

## 2026-07-12

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
