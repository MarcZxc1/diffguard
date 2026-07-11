---
name: diffguard-development
description: Implement, review, test, plan, or document DiffGuard features in its Bun, Express, Prisma, PostgreSQL, Redis, React, and GitHub App repository. Use for webhook ingestion, durable review jobs, GitHub Check Runs and comments, scanner rules, finding persistence, authentication, APIs, frontend work, schema changes, CI, security review, reliability fixes, and roadmap execution.
---

# DiffGuard development

## Required context

1. Read `docs/CONTEXT.md` and `docs/ENGINEERING_LOOP.md` before changing the repository.
2. Read the affected section of `docs/CODE_WALKTHROUGH.md` and nearby tests.
3. Read `docs/ROADMAP.md` when planning scope, choosing the next feature, or changing product behavior.
4. Read `docs/WEBHOOK_TESTING.md` and use `$github-webhook-debugging` for webhook delivery, signature, GitHub App, retry, or review-publication work.
5. Inspect `git status` and the current diff. Preserve user changes and identify pre-existing failures separately.

## Change contract

Before editing, state:

- Target behavior and why it matters.
- Affected boundary: webhook, job, rule engine, GitHub API, persistence, API, frontend, or operations.
- Success, failure, retry, authorization, and idempotency behavior where applicable.
- Expected files and smallest proving test.
- Broader verification commands.

Keep the change within one roadmap outcome unless the user explicitly broadens scope.

## Architecture boundaries

- Routes select paths and middleware; controllers validate input and shape responses.
- Services coordinate reusable application and persistence behavior.
- Worker/job handlers own asynchronous review orchestration.
- `lib/` owns shared infrastructure clients, GitHub protocol helpers, parsing, and crypto.
- Prisma models and migrations define durable state; do not rely on memory-only state for retries.
- React code uses typed API models and explicit loading, empty, success, and error states.

Do not place a growing review pipeline entirely inside the webhook route. Extract orchestration as it gains persistence, retries, or multiple GitHub calls.

## Webhook and job invariants

- Mount the GitHub webhook router before `express.json()`.
- Verify HMAC from the raw body before parsing JSON or trusting headers/payload fields.
- Validate external payloads and GitHub responses with Zod.
- Persist enough state before acknowledging work, then respond quickly and process asynchronously.
- Distinguish `RECEIVED`, `QUEUED`, `PROCESSING`, `SUCCEEDED`, and `FAILED`; a received delivery is not automatically a completed review.
- Make delivery acceptance, review creation, retries, findings, comments, and Check Runs idempotent.
- Use bounded retries only for retryable failures and retain a sanitized terminal failure reason.
- Handle pagination, rate limits, missing/truncated patches, deleted/binary files, and stale PR commits explicitly.

## GitHub integration rules

- Request least-privilege GitHub App permissions and scope installations to enabled repositories.
- Never log App private keys, webhook secrets, JWTs, installation tokens, authorization headers, or suspected secret values.
- Use stable finding fingerprints to avoid duplicate comments across retries.
- Prefer one Check Run summary per PR revision; keep inline comments bounded and actionable.
- Report clean, failed, skipped, and partial analysis distinctly. Never represent missing coverage as a clean result.
- Mock GitHub HTTP calls in unit tests and use a controlled test installation for end-to-end verification.

## Scanner-rule standard

Every rule must define:

- Stable ID and version.
- Supported files/languages and changed-line behavior.
- Severity, confidence, evidence, explanation, and remediation.
- Fingerprint inputs and suppression behavior.
- Positive, negative, false-positive, and boundary fixtures.

Do not claim broad vulnerability detection from a narrow regex. Redact suspected credentials from findings and logs. Keep repository-policy feedback, maintainability suggestions, and security findings clearly separated.

For optional LLM review, treat repository text as untrusted input, send minimum necessary context, validate structured output, reject invalid locations, deduplicate against deterministic rules, and fail open when the model is unavailable.

## Data and API changes

- Use Zod for external requests and `HttpError` for expected client errors.
- Add a versioned Prisma migration for durable schema changes; update callers, seeds/fixtures, and documentation.
- Enforce installation and repository authorization on every repository-scoped operation.
- Store only data needed for product behavior, auditability, and configured retention.
- Do not persist full patches unless a documented, reviewed requirement justifies it.

## Verification

Run the narrowest relevant tests first, then applicable broader checks:

```text
cd backend && bun test
cd backend && bun run typecheck
cd backend && bun run build
cd frontend && bun run build
```

For webhook changes, also test valid signatures, invalid signatures, duplicate delivery, retry after failure, ignored event/action, malformed JSON, missing installation, GitHub API failure, and the final observable result.

Before finalizing, inspect the diff for secrets, unrelated formatting, accidental generated files, unsafe logging, missing migrations, broken API contracts, and documentation drift.

## Documentation routing

- Update `docs/CONTEXT.md` for current architecture, API, environment, and known gaps.
- Update `docs/CODE_WALKTHROUGH.md` when file responsibilities or request flows change.
- Update `docs/WEBHOOK_TESTING.md` for webhook setup, commands, headers, or response behavior.
- Update `docs/ROADMAP.md` only when priorities, phases, or exit criteria change.
- Add dated completed work and verification evidence to `docs/DEVELOPMENT_LOG.md`.

## Guardrails

- Never expose `.env` values, credentials, tokens, real signatures, or sensitive repository content.
- Do not weaken types, validation, authorization, tests, or findings to make a check pass.
- Do not silently swallow failures or convert partial analysis into success.
- Do not add dependencies without explaining their security, maintenance, and deployment cost.
- Keep comments reason-oriented: protocol constraints, idempotency, retries, security boundaries, and non-obvious trade-offs.
