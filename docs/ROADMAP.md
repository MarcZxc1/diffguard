# DiffGuard Product and Engineering Roadmap

## Product Goal

Build a trustworthy GitHub pull-request review service that finds actionable security problems, explains them at the relevant changed line, and reports a reliable review result without exposing repository secrets or blocking development on noisy findings.

DiffGuard must describe its actual coverage precisely. Until multiple security rule families and dependency checks exist, present it as a focused PR security assistant—not a comprehensive vulnerability scanner.

## Delivery Principles

- Verify GitHub signatures before parsing webhook JSON.
- Acknowledge valid webhook deliveries quickly and process reviews asynchronously.
- Make every delivery, review run, finding, and posted result retry-safe and observable.
- Prefer deterministic rules for high-confidence findings; use LLM review only as a bounded secondary layer.
- Minimize GitHub App permissions and never log credentials, installation tokens, private keys, raw secrets, or complete sensitive patches.
- Treat false-positive control, suppression, and explainability as product features.
- Keep checks advisory until reliability and precision are demonstrated on real repositories.

## Current Baseline

The current MVP:

- Verifies raw-body HMAC SHA-256 webhook signatures.
- Accepts `pull_request.opened` and `pull_request.synchronize`.
- Validates the installation ID and authenticates as a GitHub App.
- Persists delivery IDs to reject duplicate processing.
- Fetches the first page of changed files.
- Parses available unified patches.
- Detects a narrow set of likely hardcoded secrets on added lines.
- Posts up to three inline review comments.
- Has 29 passing backend tests, including route-level and infrastructure lifecycle coverage.

Known remaining debt:

- Deliveries are marked as received before analysis succeeds, so a failed review cannot safely resume from the same delivery.
- Webhook processing performs GitHub API and analysis work synchronously.
- Pull-request file pagination, truncated/missing patch handling, finding persistence, and comment idempotency are incomplete.
- The frontend is still an authentication scaffold.

## Phase 0 — Stabilize the Foundation

Goal: establish a clean, reproducible baseline before expanding scanner coverage.

Status: implementation and local verification completed on 2026-07-12.

- [x] Resolve the admin create-user/password contract deliberately.
- [x] Make backend tests, typecheck, and build pass together in CI.
- [x] Add route-level tests for webhook response behavior and middleware ordering.
- [x] Add graceful Prisma/Redis startup and shutdown behavior.
- [x] Document required GitHub App permissions and supported webhook events.
- [x] Commit the current MVP as a reviewable, documented change set.

Exit criteria:

- Tests, typecheck, and builds pass from a clean checkout.
- CI reports those checks on every pull request.
- No known contract mismatch is accepted as the normal baseline.

## Phase 1 — Reliable Review Processing

Goal: ensure every accepted delivery reaches a durable terminal state or can be retried safely.

- Add persisted installations and repositories with an explicit enabled/disabled state.
- Model webhook deliveries and review runs with states such as `RECEIVED`, `QUEUED`, `PROCESSING`, `SUCCEEDED`, and `FAILED`.
- Return a fast success response after verification and durable enqueueing.
- Move patch fetching, scanning, and publishing into a worker/job boundary.
- Record attempt count, timestamps, sanitized failure category, and retry eligibility.
- Add bounded retries with backoff for retryable GitHub API failures.
- Create stable finding fingerprints and make comment publication idempotent.
- Support all pull-request file pages and detect when GitHub omits or truncates patches.
- Avoid treating a recorded-but-failed delivery as successfully processed.

Exit criteria:

- Replaying a delivery cannot create duplicate reviews or comments.
- A transient GitHub failure can recover without manual database edits.
- A review run exposes an observable final state and sanitized failure reason.
- Large PRs produce an explicit partial-analysis status instead of silent coverage gaps.

## Phase 2 — Deterministic Scanner Framework

Goal: add security rules through a consistent, testable rule contract.

- Define a rule interface with ID, version, supported languages/files, severity, confidence, evidence, remediation, and fingerprint inputs.
- Improve secret detection with provider patterns, entropy/placeholder handling, test-fixture awareness, and safe redaction.
- Add focused rules for unsafe SQL construction, command execution, path handling, authentication/authorization changes, CORS/security configuration, and missing external-input validation.
- Separate repository-policy findings such as missing tests from vulnerability findings.
- Add per-rule fixtures for true positives, false positives, and boundary cases.
- Add repository configuration for rule enablement, severity thresholds, ignored paths, and documented suppressions.
- Never include the suspected secret value in stored evidence, logs, or GitHub comments.

Exit criteria:

- Every enabled rule has positive and negative fixtures.
- Findings state the exact evidence and remediation without claiming certainty beyond the rule's capability.
- Suppressions are reviewable, scoped, and auditable.
- Precision is measured during a non-blocking pilot before any rule becomes blocking.

## Phase 3 — GitHub-Native Review Experience

Goal: provide one coherent review result rather than an uncontrolled stream of comments.

- Publish a GitHub Check Run for queued, in-progress, successful, failed, and partial analysis states.
- Attach bounded inline annotations/comments only for the most actionable findings.
- Add a summary containing analyzed files, skipped files, rule versions, finding counts, and limitations.
- Support safe re-request/re-run behavior and relevant PR actions such as reopening or becoming ready for review.
- Respect draft pull-request policy and repository configuration.
- Define when high-confidence findings may fail a required check.

Exit criteria:

- Each supported PR revision has one identifiable review result.
- Contributors can distinguish clean, failed, partial, and skipped analysis.
- Branch protection is enabled only after the advisory pilot meets reliability and precision targets.

## Phase 4 — Optional Structured LLM Review

Goal: add contextual review without making an LLM the authority for security decisions.

- Send only the minimum required diff and sanitized repository context.
- Treat code and comments as untrusted prompt content.
- Validate model output with Zod and reject unknown fields, invalid locations, and unsupported severities.
- Require evidence, remediation, confidence, and a deterministic finding fingerprint.
- Deduplicate LLM findings against deterministic rules.
- Apply strict finding limits, timeouts, cost limits, and fail-open behavior.
- Document provider, retention, privacy, and repository-consent requirements before enabling the feature.

Exit criteria:

- LLM failure cannot block deterministic analysis or webhook processing.
- Invalid or locationless findings are never posted.
- Repository owners explicitly opt in with understood data-handling rules.

## Phase 5 — Product Dashboard and Operations

Goal: make review history, configuration, and operational health understandable.

- Replace the starter frontend with repository, review-run, finding, and settings views.
- Add installation/repository authorization boundaries and audit logs.
- Show queued, processing, succeeded, failed, partial, and re-run states.
- Add metrics for processing time, retry rate, GitHub API failures, rule precision, suppression rate, and skipped coverage.
- Add retention and deletion controls for review data.
- Add operational runbooks, backups, migrations, and deployment health checks.

### Curated PR Evidence Export

Add an explicit **Save PR Evidence** action for users who want to preserve an important pull request as thesis or project evidence.

- Let an authorized user select a pull request, preview the content to be exported, and confirm the save intentionally. Do not export every pull request automatically.
- Fetch authoritative PR metadata through the DiffGuard backend using the GitHub App installation token. The Vercel-hosted frontend must never receive GitHub App private keys or installation tokens.
- Export the PR title, description snapshot, repository, PR number, author, status, relevant dates, source URL, head/merge commit, review/check summary, and user-written thesis relevance.
- Treat GitHub as the source of truth. Include the source URL and export timestamp so the Markdown record is clearly a snapshot rather than an independent canonical copy.
- Use a versioned Markdown schema with a filename such as `PR-0042 Add measurement validation.md` and a recommended destination of `11 Testing and QA/PR Reviews/` in the target vault.
- Link milestone-level PR records from `target Phase 1 Implementation Memory.md` instead of copying every commit or review comment into the vault.
- Keep the initial Vercel flow filesystem-independent: return a sanitized `.md` download that the user places in the vault. Consider an authenticated local Obsidian plugin or companion service only after the download workflow is safe and useful.
- Authorize every export against the selected installation and repository, record who requested it, and rate-limit the endpoint.
- Sanitize filenames, YAML values, Markdown, HTML, links, and Obsidian embed syntax. Apply size limits and prevent path traversal, frontmatter injection, template execution, or arbitrary destination paths.
- Never export GitHub tokens, webhook data, full diffs, complete source patches, suspected credential values, private DiffGuard logs, or unnecessary sensitive data.
- Make repeated exports deterministic using repository plus PR number as the identity. A later export should be an explicit refresh/revision, not a silently duplicated note.

Exit criteria:

- Users see only installations and repositories they are authorized to manage.
- Operators can diagnose failures without accessing secrets or complete source patches.
- Retention, deletion, and backup behavior are documented and tested.
- An authorized user can preview and download a sanitized PR Markdown record without exposing GitHub credentials to the browser.
- Unauthorized repositories, unsafe filenames/content, excessive payloads, and duplicate export requests have tested failure behavior.
- The exported note renders correctly in Obsidian and preserves a verifiable link to the original GitHub PR.

## Phase 6 — target Pilot

Goal: validate DiffGuard safely on the target repository before relying on it as a merge gate.

1. Install the GitHub App only on the target repository with minimum permissions.
2. Run DiffGuard in advisory mode for several representative pull requests.
3. Record review-run links, confirmed findings, false positives, skipped files, and processing failures.
4. Tune rule thresholds and repository configuration without hiding real defects.
5. Review privacy implications for any source fixtures or generated data.
6. Export selected merged PRs into `11 Testing and QA/PR Reviews/`, then link milestone evidence from the implementation memory.
7. Verify exported notes contain no secrets, full patches, unnecessary personal data, or broken source links.
8. Enable a required check only for rules that meet agreed precision and reliability targets.

Pilot evidence belongs primarily in GitHub. Thesis documentation should link important PRs and summarize outcomes rather than duplicate every commit or comment.

## Cross-Cutting Definition of Done

A roadmap item is complete only when:

- Its success, retry, failure, and authorization paths are defined where applicable.
- Focused tests pass and broader test/typecheck/build results are recorded.
- Database and API changes include migrations/contracts and compatibility notes.
- GitHub API behavior handles pagination, rate limits, retries, and idempotency as applicable.
- Logs and persisted records exclude secrets, tokens, private keys, and unnecessary patch content.
- Documentation states actual coverage and remaining limitations.
- The final diff contains no unrelated rewrites or generated secrets.

## Explicit Non-Goals for the Early Phases

- Claiming complete vulnerability coverage.
- Replacing human code review.
- Blocking merges based on unvalidated heuristics or LLM-only findings.
- Building a custom implementation of every dependency or ecosystem scanner.
- Supporting many organizations before single-repository processing is reliable.
