---
name: github-webhook-debugging
description: Diagnose, test, secure, or extend DiffGuard's GitHub webhook and GitHub App review pipeline. Use for HMAC/raw-body failures, ngrok routing, webhook response codes, delivery retries and idempotency, installation authentication, pull-request file fetching, pagination, inline comments, Check Runs, rate limits, duplicate reviews, partial analysis, and failures such as 400, 401, 404, 405, 422, 429, 502, or timeout/retry behavior.
---

# GitHub webhook debugging

## Required context

Read:

- `docs/WEBHOOK_TESTING.md`
- The webhook and review sections of `docs/CODE_WALKTHROUGH.md`
- `backend/src/index.ts`
- `backend/src/routes/github-webhooks.routes.ts`
- `backend/src/lib/github-webhook.ts`
- The affected GitHub App, review-client, delivery-service, worker, and tests

Inspect `git status` and preserve current user changes. Never use or print real secret values during diagnosis.

## Diagnostic sequence

### 1. Transport and route

- Confirm `POST https://<host>/api/webhook/github` reaches API port `3000`.
- Confirm `content-type: application/json` and GitHub delivery headers are present.
- Interpret browser `GET` as a reachability check only; it should return `405`.
- Check proxy body limits, timeouts, and whether a proxy rewrites request bytes.

### 2. Raw-body signature

- Keep the webhook router above `express.json()`.
- Use `express.raw({ type: "application/json" })` for the signed endpoint.
- Sign and send the exact same bytes, including whitespace and final newline.
- Require the full `sha256=<64 hex characters>` header.
- Verify HMAC before `JSON.parse` and use timing-safe comparison after a length check.
- Build tests from a test-only secret; never copy an `.env` secret into source, docs, output, or fixtures.

### 3. Payload and event policy

- Validate JSON and required delivery, repository, PR, commit, and installation fields.
- Filter event and action only after signature verification.
- Confirm draft, reopened, ready-for-review, and synchronize behavior matches documented policy.
- Treat unsupported events/actions as intentional `202` outcomes, not processing failures.

### 4. Durable delivery lifecycle

- Distinguish accepted delivery from completed review.
- Inspect the delivery/review state, attempt count, timestamps, and sanitized failure category.
- Confirm duplicate delivery handling is atomic under concurrency.
- Reproduce retry after a failure that occurs after registration.
- Ensure a failed attempt can resume safely and cannot duplicate findings, comments, or Check Runs.
- Do not delete idempotency records merely to hide a lifecycle bug.

### 5. GitHub App authentication

- Validate App ID and installation ID without logging them unnecessarily.
- Confirm the private key is readable and correctly formatted without printing it.
- Confirm the App is installed on the target repository with minimum required permissions.
- Inspect GitHub status codes and sanitized response metadata; never log installation tokens or authorization headers.
- Distinguish configuration, permission, installation-scope, rate-limit, and transient upstream failures.

### 6. PR files and patches

- Follow pagination until all supported changed files are fetched.
- Detect absent/truncated patches, binary files, renames, deletions, and oversized PRs.
- Verify diff line mapping against multi-hunk and edge-case fixtures.
- Mark incomplete coverage as partial/skipped; never report it as a clean review.
- Confirm comments target the current head commit and a valid right-side changed line.

### 7. Published result

- Use stable finding fingerprints and verify retries do not duplicate output.
- Check inline-comment validation failures such as stale commits or invalid line positions.
- Prefer one Check Run per PR revision and confirm queued, in-progress, success, failure, and partial states.
- Keep finding counts and annotations bounded, with a useful summary when output is truncated.

## Minimum test matrix

- Valid and invalid signatures.
- Missing/malformed signature and raw body.
- Invalid JSON and missing delivery ID.
- Ignored event and ignored action.
- Missing/invalid installation or incomplete PR payload.
- New delivery, concurrent duplicate, and sequential retry.
- Failure before enqueue, during analysis, and during result publication.
- Multi-page file list and missing/truncated patch.
- Zero findings, bounded findings, duplicate fingerprints, and stale comment location.
- GitHub 401/403, 404, 422, rate-limit, 5xx, and timeout behavior.

Run focused tests first, then:

```text
cd backend && bun test
cd backend && bun run typecheck
cd backend && bun run build
```

## Response interpretation

- `200`: synchronous operation completed or a duplicate was safely acknowledged, according to the documented contract.
- `202`: valid delivery was intentionally ignored or durably accepted for asynchronous work.
- `400`: malformed body, parser/content-type problem, or missing required payload/header data.
- `401`: webhook HMAC is missing or invalid; do not confuse this with GitHub App API authentication.
- `403`: GitHub App permission, installation scope, or rate-limit policy may be blocking an API call.
- `404`: local route/proxy mismatch or GitHub resource/installation scope mismatch, depending on which request failed.
- `405`: the webhook route was reached with a non-POST method.
- `422`: GitHub rejected a comment, annotation, Check Run, commit, path, or line coordinate.
- `429` or rate-limit headers: pause/retry according to bounded backoff policy.
- `5xx`/timeout: distinguish DiffGuard failure from GitHub/proxy failure; preserve retryable durable state.

Return sanitized errors to callers and log only enough metadata to correlate the delivery and review run. Never log webhook secrets, signatures from real deliveries, private keys, App JWTs, installation tokens, authorization headers, suspected credential values, or full patches.
