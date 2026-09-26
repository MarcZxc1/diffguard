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

The current implementation:

- Verifies raw-body HMAC SHA-256 webhook signatures.
- Accepts `pull_request.opened` and `pull_request.synchronize`.
- Validates the installation ID and authenticates as a GitHub App.
- Persists installations, repositories, deliveries, review runs, findings, retry state, and comment publication state.
- Acknowledges supported deliveries after atomic durable enqueue and processes them in a database-backed worker.
- Fetches up to 30 pages of changed files and explicitly records partial coverage.
- Runs seven focused security rule families and three separate repository-policy rules through a versioned contract.
- Supports repository rule enablement, severity thresholds, ignored paths, and reasoned suppressions.
- Posts at most three inline security comments with stable fingerprint-marker deduplication.
- Publishes one GitHub Check Run summary per worker-processed revision, with bounded annotations.
- Supports optional opt-in structured LLM review with fail-open behavior.
- Exposes repository-scoped dashboard APIs, settings, metrics, reruns, retention pruning, audit logs, and sanitized PR evidence export.
- Exposes an advisory-pilot dashboard for audited finding verification, rule-version precision, reliability tracking, and precision-gated enforcement.
- Has 138 passing backend tests and 8 frontend regression tests covering the implemented contracts.
- Has reusable authenticated browser accessibility validation for desktop, 320px reflow, keyboard focus, semantic structure, text resizing, and delayed loading states.

Known remaining debt:

- Rule precision must still be measured in an advisory pilot before any finding can block merges.
- The durable worker currently shares the API process; separate deployment is operational hardening.
- Production deployment, recovery, observability, and real-integration release gates remain Phase 10 work.

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

Status: implementation and local verification completed on 2026-07-12.

- [x] Add persisted installations and repositories with an explicit enabled/disabled state.
- [x] Model webhook deliveries and review runs with states such as `RECEIVED`, `QUEUED`, `PROCESSING`, `SUCCEEDED`, and `FAILED`.
- [x] Return a fast success response after verification and durable enqueueing.
- [x] Move patch fetching, scanning, and publishing into a worker/job boundary.
- [x] Record attempt count, timestamps, sanitized failure category, and retry eligibility.
- [x] Add bounded retries with backoff for retryable GitHub API failures.
- [x] Create stable finding fingerprints and make comment publication idempotent.
- [x] Support all pull-request file pages and detect when GitHub omits or truncates patches.
- [x] Avoid treating a recorded-but-failed delivery as successfully processed.

Exit criteria:

- [x] Replaying a delivery cannot create duplicate reviews or comments.
- [x] A transient GitHub failure can recover without manual database edits.
- [x] A review run exposes an observable final state and sanitized failure reason.
- [x] Large PRs produce an explicit partial-analysis status instead of silent coverage gaps.

## Phase 2 — Deterministic Scanner Framework

Goal: add security rules through a consistent, testable rule contract.

Status: engineering implementation and local verification completed on 2026-07-12; advisory-pilot precision evidence remains pending.

- [x] Define a rule interface with ID, version, supported languages/files, severity, confidence, evidence, remediation, and fingerprint inputs.
- [x] Improve secret detection with provider patterns, entropy/placeholder handling, test-fixture awareness, and safe redaction.
- [x] Add focused rules for unsafe SQL construction, command execution, path handling, authentication/authorization changes, CORS/security configuration, and missing external-input validation.
- [x] Separate repository-policy findings such as missing tests from vulnerability findings.
- [x] Add per-rule fixtures for true positives, false positives, and boundary cases.
- [x] Add repository configuration for rule enablement, severity thresholds, ignored paths, and documented suppressions.
- [x] Never include the suspected secret value in stored evidence, logs, or GitHub comments.

Exit criteria:

- [x] Every enabled rule has positive and negative fixtures.
- [x] Findings state the exact evidence and remediation without claiming certainty beyond the rule's capability.
- [x] Suppressions are reviewable, scoped, and auditable.
- [ ] Precision is measured during a non-blocking pilot before any rule becomes blocking.

## Phase 3 — GitHub-Native Review Experience

Goal: provide one coherent review result rather than an uncontrolled stream of comments.

Status: implementation and local verification completed on 2026-07-12; required-check enforcement remains advisory until pilot precision evidence exists.

- [x] Publish a GitHub Check Run for queued, in-progress, successful, failed, skipped, and partial analysis states.
- [x] Attach bounded inline annotations/comments only for the most actionable findings.
- [x] Add a summary containing analyzed files, skipped files, rule versions, finding counts, LLM state, and limitations.
- [x] Support safe re-request/re-run behavior and relevant PR actions such as reopening or becoming ready for review.
- [x] Respect draft pull-request policy and repository configuration.
- [x] Define when high-confidence findings may fail a required check, while keeping default mode advisory.

Exit criteria:

- [x] Each supported PR revision has one identifiable review result.
- [x] Contributors can distinguish clean, failed, partial, and skipped analysis.
- [ ] Branch protection is enabled only after the advisory pilot meets reliability and precision targets.

## Phase 4 — Optional Structured LLM Review

Goal: add contextual review without making an LLM the authority for security decisions.

Status: implementation and local verification completed on 2026-07-12; repository opt-in is required.

- [x] Send only the minimum required diff and sanitized repository context.
- [x] Treat code and comments as untrusted prompt content.
- [x] Validate model output with Zod and reject unknown fields, invalid locations, and unsupported severities.
- [x] Require evidence, remediation, confidence, and a deterministic finding fingerprint.
- [x] Deduplicate LLM findings against deterministic rules.
- [x] Apply strict finding limits, timeouts, cost limits, and fail-open behavior.
- [x] Document provider, retention, privacy, and repository-consent requirements before enabling the feature.

Exit criteria:

- [x] LLM failure cannot block deterministic analysis or webhook processing.
- [x] Invalid or locationless findings are never posted.
- [x] Repository owners explicitly opt in with understood data-handling rules.

## Phase 5 — Product Dashboard and Operations

Goal: make review history, configuration, and operational health understandable.

Status: implementation and local verification completed on 2026-07-12; pilot precision measurement still belongs to Phase 6.

- [x] Replace the starter frontend with repository, review-run, finding, and settings views.
- [x] Add installation/repository authorization boundaries and audit logs.
- [x] Show queued, processing, succeeded, failed, partial, skipped, and re-run states.
- [x] Add metrics for processing time, retry rate, GitHub API failures, suppression rate, and skipped coverage.
- [x] Add retention and deletion controls for review data.
- [x] Add operational runbooks, backups, migrations, and deployment health checks.
- [x] Move browser authentication from `localStorage` to a short-lived HttpOnly cookie with centralized expiry handling.
- [x] Make repository loading latest-request-wins and serialize settings mutations.
- [x] Add accessible dynamic status, form labels, table captions, and review-detail focus management.
- [x] Add frontend regression tests and enforce frontend lint/tests in CI.

### Curated PR Evidence Export

Add an explicit **Save PR Evidence** action for users who want to preserve an important pull request as project evidence.

- [x] Let an authorized user select a pull request, preview the content to be exported, and confirm the save intentionally. Do not export every pull request automatically.
- [x] Fetch authoritative PR metadata through the DiffGuard backend using the GitHub App installation token. The Vercel-hosted frontend must never receive GitHub App private keys or installation tokens.
- [x] Export the PR title, description snapshot, repository, PR number, author, status, relevant dates, source URL, head/merge commit, review/check summary, and user-written evidence context.
- [x] Treat GitHub as the source of truth. Include the source URL and export timestamp so the Markdown record is clearly a snapshot rather than an independent canonical copy.
- [x] Use a versioned Markdown schema with a filename such as `PR-0042 Add measurement validation.md` and let users choose their own documentation destination.
- [x] Link milestone-level PR records from existing project documentation instead of copying every commit or review comment.
- [x] Keep the initial Vercel flow filesystem-independent: return a sanitized `.md` download that the user places in the vault. Consider an authenticated local Obsidian plugin or companion service only after the download workflow is safe and useful.
- [x] Authorize every export against the selected installation and repository, record who requested it, and rate-limit the endpoint.
- [x] Sanitize filenames, YAML values, Markdown, HTML, links, and Obsidian embed syntax. Apply size limits and prevent path traversal, frontmatter injection, template execution, or arbitrary destination paths.
- [x] Never export GitHub tokens, webhook data, full diffs, complete source patches, suspected credential values, private DiffGuard logs, or unnecessary sensitive data.
- [x] Make repeated exports deterministic using repository plus PR number as the identity. A later export should be an explicit refresh/revision, not a silently duplicated note.

Exit criteria:

- [x] Users see only installations and repositories they are authorized to manage.
- [x] Operators can diagnose failures without accessing secrets or complete source patches.
- [x] Retention, deletion, and backup behavior are documented and tested.
- [x] An authorized user can preview and download a sanitized PR Markdown record without exposing GitHub credentials to the browser.
- [x] Unauthorized repositories, unsafe filenames/content, excessive payloads, and duplicate export requests have tested failure behavior.
- [x] The exported note renders correctly in Obsidian and preserves a verifiable link to the original GitHub PR.

## Phase 6 — Target Pilot

Goal: validate DiffGuard safely on the target repository before relying on it as a merge gate.

Status: pilot workflow implementation and local verification completed on 2026-07-21. A public-evidence audit on 2026-07-21 found only three unique DiffGuard runs, including one partial run and two runs over identical synthetic fixtures; no human finding verdicts were observable. Real target-repository evidence collection remains pending.

Implementation support:

- [x] Expose repository-scoped review findings for manager verification in the dashboard.
- [x] Record audited confirmed/false-positive decisions and optional notes.
- [x] Report distinct reviewed PRs, full-coverage reliability, per-rule-version precision, and explicit readiness blockers.
- [x] Reject enforcement until pilot thresholds are met and restrict blocking results to eligible deterministic rule versions.
- [x] Keep LLM, policy, suppressed, and unproven rule findings advisory.
- [x] Document the operational pilot and evidence-retention workflow.

1. Install the GitHub App only on the target repository with minimum permissions.
2. Run DiffGuard in advisory mode for several representative pull requests.
3. Record review-run links, confirmed findings, false positives, skipped files, and processing failures.
4. Tune rule thresholds and repository configuration without hiding real defects.
5. Review privacy implications for any source fixtures or generated data.
6. Export selected merged PRs into the team’s chosen documentation system, then link milestone evidence from the relevant project record.
7. Verify exported notes contain no secrets, full patches, unnecessary personal data, or broken source links.
8. Enable a required check only for rules that meet agreed precision and reliability targets.

Pilot evidence belongs primarily in GitHub. Supporting documentation should link important PRs and summarize outcomes rather than duplicate every commit or comment.

## Phase 7 — User Authentication & Direct Repository Connection

Goal: add GitHub OAuth 2.0 sign-in so individual users can authenticate with GitHub, discover repositories they already have access to, and connect a chosen repository to DiffGuard without manual database editing.

Status: direct GitHub OAuth and production token-lifecycle implementation completed and locally verified as of 2026-07-21. Supabase remains an allowed future auth provider, but the current code path is direct GitHub OAuth backed by PostgreSQL-compatible Prisma tables.

Implementation may use either:

1. a direct GitHub OAuth 2.0 authorization-code flow owned by DiffGuard, or
2. a Supabase GitHub provider flow that still gives DiffGuard the authenticated user identity and repository-selection data it needs.

Important boundary: GitHub OAuth is for user identity, repository discovery, and self-service onboarding. The GitHub App remains the integration that receives webhooks, fetches PR content, and publishes review results.

1. [x] Implement the GitHub OAuth 2.0 authorization-code flow for user sign-in and token exchange.
2. [x] Link the GitHub identity to the existing DiffGuard user record or create one on first sign-in.
3. [x] Use GitHub API access to list repositories the signed-in user can manage or inspect, depending on the permissions granted.
4. [x] Provide a self-service UI that lets a signed-in user select a repository and connect it to DiffGuard.
5. [x] Store necessary auth material securely for the direct-OAuth path: use an HTTP-only OAuth state cookie, store user OAuth tokens encrypted at rest, and exchange callback success through a short-lived one-time backend code instead of a URL JWT.
6. [x] Make repository connection checks use the signed-in user's GitHub permissions: only GitHub `admin` or `maintain` can create a DiffGuard `MANAGER` grant.
7. [x] Keep the current local username/password flow as an operational fallback.
8. [x] Keep the persistence layer PostgreSQL-compatible across Docker Compose, a locally installed PostgreSQL server, or a managed PostgreSQL service such as Supabase.

Exit criteria:

- [x] A user can sign in with GitHub and reach the dashboard without manual DB grants.
- [x] The dashboard shows only repositories discoverable through the signed-in GitHub user's App installations and clearly disables repositories the user cannot legitimately connect.
- [x] A selected repository can be connected end-to-end without touching the database by hand.
- [x] Auth/session handling avoids exposing GitHub tokens or backend JWTs in callback URLs.
- [x] The GitHub App still owns review execution, checks, and comments.
- [x] The repository backend runs unchanged against Docker Postgres, local Postgres, or Supabase Postgres.
- [x] Production deployments handle token revocation/expiry, automatically rotate expiring GitHub user tokens when refresh tokens are supplied, and provide a clear re-authentication path when the grant cannot be refreshed.

## Phase 7.1 — Dashboard Observability and AI Review Operations

Goal: make review progress and optional AI review status understandable without requiring manual refreshes or noisy PR comments.

Status: implementation and local verification completed on 2026-07-21.

Important boundary: AI infrastructure failures are operational signals, not contributor review comments. The frontend should show detailed AI status for maintainers. The GitHub Check Run should summarize AI coverage briefly. Inline PR comments should be reserved for actionable validated findings only.

1. [x] Add near-realtime dashboard updates for repository review runs so users do not need to click Refresh after opening a PR or rerunning a review.
   - Preferred first implementation: bounded polling while the selected repository has `QUEUED` or `PROCESSING` runs.
   - Future upgrade: Server-Sent Events or WebSocket stream if polling becomes noisy.
   - Preserve explicit loading, stale, error, and empty states.
2. [x] Surface richer LLM review state in the frontend review-run table or detail panel.
   - Show `SKIPPED`, `SUCCEEDED`, or `FAILED`.
   - Show sanitized `llmFailureMessage` when failed.
   - Clarify that deterministic review still completed when LLM fails open.
3. [x] Improve sanitized LLM failure recording.
   - Store safe status-level messages such as `OpenAI review request failed with status 400`.
   - Do not persist OpenAI response bodies, prompts, authorization headers, API keys, raw patches, or suspected secret values.
4. [x] Add a manager-only **Test AI Review** button in repository settings.
   - Backend endpoint should send a tiny synthetic structured-output request to the configured model.
   - It should verify API reachability, authentication, quota/rate-limit status, model availability, and structured-output compatibility.
   - It must not send repository code for this health check.
5. [x] Display a toast after testing AI review.
   - Success example: `AI review is reachable for gpt-5.6-sol.`
   - Failure examples: `OpenAI authentication failed`, `quota or rate limit reached`, `model does not support required structured output`, or `request timed out`.
   - Toasts should avoid leaking secrets or raw upstream response bodies.
6. [x] Include AI status in the GitHub Check Run summary only at coverage level.
   - Good: `LLM review: failed open; deterministic checks completed.`
   - Avoid posting PR comments for AI infrastructure failures.
7. [x] Allow AI-generated PR comments only for validated actionable findings.
   - The finding must map to an added line, pass strict schema validation, include evidence/remediation, and be deduplicated against deterministic findings.
   - Label them clearly as AI-assisted findings.

Exit criteria:

- [x] Review-run state updates appear in the dashboard automatically during active processing.
- [x] Maintainers can test OpenAI configuration from the dashboard and receive a toast result.
- [x] LLM failure reasons are visible in the frontend and sanitized in persisted data.
- [x] GitHub Check Runs summarize AI coverage without creating noisy infrastructure-failure comments.
- [x] AI-generated PR comments are only posted for validated actionable findings.

## Phase 8 — Style and Maintainability Policies

Goal: provide opt-in, repository-specific naming feedback without presenting style preferences as security findings.

Status: initial JavaScript/TypeScript naming-policy implementation and local verification completed on 2026-07-21.

- [x] Add an opt-in `policy.identifier-naming` rule for camelCase value/function declarations and PascalCase type declarations.
- [x] Permit conventional `UPPER_SNAKE_CASE` constants and leading underscores.
- [x] Add an opt-in `policy.repository-path-naming` rule for added or renamed source files and folders.
- [x] Let repository managers independently select off, kebab-case, camelCase, or snake_case path conventions from the dashboard.
- [x] Keep naming findings categorized as `POLICY`, excluded from security comments, pilot precision, and blocking conclusions.
- [x] Bound findings per naming rule and add positive, negative, opt-in, and enforcement-boundary tests.

Exit criteria:

- [x] Existing repositories receive no naming findings until a manager opts in.
- [x] Repository naming configuration is strictly validated and persisted with existing rule configuration.
- [x] Policy findings explain the configured convention and remediation without claiming a vulnerability.
- [x] Naming findings cannot fail a Check Run, even in enforcing mode.

Future Phase 8 extensions may add language-aware adapters or other maintainability policies after real-repository signal quality is evaluated.

## Phase 9 — Generic Repository Governance

Goal: let repositories express their own pull-request review expectations without hard-coded customer names, paths, fixtures, or data in DiffGuard.

Status: generic governance implementation and local verification completed on 2026-07-30. Real repositories must still tune the opt-in policy in advisory mode.

- [x] Add strict opt-in configuration for PR description length, required Markdown sections, issue references, and advisory changed-file limits.
- [x] Add generic protected-path and test-path globs without embedding any target repository structure.
- [x] Fetch PR metadata only when governance is enabled and keep title/body transient during review processing.
- [x] Persist only bounded advisory findings, never the raw PR description.
- [x] Add manager dashboard controls with a deliberate Save action and neutral examples.
- [x] Keep all governance findings categorized as `POLICY`, excluded from inline security comments, pilot precision, and blocking conclusions.
- [x] Add positive, negative, boundary, strict-validation, opt-in, and description-non-persistence tests.
- [x] Document the privacy boundary and add a private-identifier audit to final verification.

Exit criteria:

- [x] Existing repositories receive no governance findings until a manager opts in.
- [x] No database migration or additional GitHub App permission is required.
- [x] Repository-specific headings and paths exist only in runtime repository configuration.
- [x] Pull-request descriptions are not copied into persisted findings.
- [x] GitHub-native CODEOWNERS, required reviews, and branch protection remain separate deliberate controls.

## Phase 10 — Production Readiness and Controlled Release

Goal: turn the verified application into a repeatable, observable, recoverable private service without weakening the advisory-first safety model.

Status: planned on 2026-07-30. Local implementation verification is strong, but production infrastructure, real-integration staging evidence, recovery rehearsal, and advisory-pilot evidence remain pending.

Production readiness has two separate release gates:

1. **Advisory production** may begin after the source, infrastructure, data-safety, security, observability, and staging gates below pass.
2. **Enforced production** may begin only after the advisory pilot also meets its reliability and per-rule precision thresholds and an operator deliberately enables the GitHub required check.

### 10.1 Release Source and Supply Chain

- [ ] Land the current work through a reviewed pull request from a dedicated release-preparation branch.
- [ ] Require backend tests, frontend tests, lint, typecheck, builds, Prisma validation, dependency audit, and private-identifier scanning from a clean checkout.
- [ ] Add dependency-update automation, lockfile review, and a documented policy for urgent security updates.
- [ ] Produce a versioned release artifact tied to an immutable commit and record its build/runtime versions.
- [ ] Generate an SBOM or equivalent dependency inventory for each release artifact.

Exit evidence:

- [ ] The release commit passes every required CI check without local-only state.
- [ ] The deployed artifact can be traced back to an immutable reviewed commit.
- [ ] Dependency and container scans contain no unresolved critical or high-severity production findings.

### 10.2 Production Deployment Architecture

- [ ] Choose and document the private hosting topology for frontend, API, worker, PostgreSQL, and Redis.
- [ ] Package the API and worker as reproducible production artifacts; run the durable worker separately from the request-serving API.
- [ ] Serve the frontend and API over HTTPS on the same site so the current HttpOnly SameSite=Lax session design remains valid.
- [ ] Add liveness and readiness checks that cover process health, PostgreSQL, Redis, migration compatibility, and worker queue progress.
- [ ] Configure bounded CPU, memory, worker concurrency, request body size, connection pools, timeouts, and graceful shutdown behavior.
- [ ] Document DNS, TLS renewal, proxy trust, CORS origin, webhook URL, OAuth callback URL, and rollback routing.

Exit evidence:

- [ ] A fresh private staging environment can be provisioned from documentation without manual database edits.
- [ ] API and worker processes can restart independently without losing or duplicating accepted work.
- [ ] Failed readiness checks remove unhealthy instances from traffic.

### 10.3 Secrets, Identity, and Security Controls

- [ ] Store JWT, webhook, OAuth, token-encryption, GitHub App, database, Redis, and optional AI credentials only in a production secret manager.
- [ ] Validate production secret strength and reject placeholder, development, or missing values at startup.
- [ ] Confirm the development enforcement bypass is disabled and rejected in the production environment.
- [ ] Re-verify least-privilege GitHub App permissions and repository installation scope.
- [ ] Add an explicit Content Security Policy and review the existing Helmet, CORS, cookie, rate-limit, and proxy settings under the deployed origins.
- [ ] Document secret rotation, credential revocation, incident containment, and access-review procedures.
- [ ] Run static security, dependency, container, and secret scans against the release candidate.

Exit evidence:

- [ ] No production secret exists in source, build output, logs, browser storage, URLs, or CI artifacts.
- [ ] Session, OAuth, webhook, authorization, and repository-isolation smoke tests pass against staging.
- [ ] Rotation of each long-lived credential is rehearsed without losing persisted review state.

### 10.4 Database, Backup, and Recovery

- [ ] Provision managed PostgreSQL and Redis with private networking, encryption, authenticated access, and supported versions.
- [ ] Dry-run `prisma migrate deploy` against a restored production-like snapshot before the first production migration.
- [ ] Define recovery point and recovery time objectives, backup frequency, retention, encryption, and ownership.
- [ ] Perform and time a full backup restore into an isolated environment; verify schema, users, repositories, audit logs, review runs, and findings.
- [ ] Document forward migration, rollback/roll-forward, failed migration recovery, and retention-pruning safeguards.
- [ ] Verify Redis loss or restart does not corrupt durable database review state.

Exit evidence:

- [ ] Migration and restore rehearsals complete without manual data repair.
- [ ] A tested backup exists outside the primary database failure domain.
- [ ] Operators can recover service within the agreed recovery objectives.

### 10.5 Observability and Reliability

- [ ] Emit structured, redacted logs with request, webhook delivery, repository, and review-run correlation identifiers.
- [ ] Monitor API latency/error rate, webhook acceptance, queue depth/age, worker throughput, retry exhaustion, stale runs, GitHub failures, database health, Redis health, and resource saturation.
- [ ] Define service-level objectives and alert thresholds with named owners and escalation paths.
- [ ] Add staging load and soak tests for webhook bursts, large pull requests, concurrent repository reads, settings writes, and worker restarts.
- [ ] Exercise rate limits, GitHub failures, expired OAuth grants, partial patches, database interruptions, Redis interruptions, and graceful deployment shutdowns.
- [ ] Keep raw tokens, webhook bodies, complete patches, suspected secrets, and unnecessary personal data out of telemetry.

Exit evidence:

- [ ] Every critical failure mode produces an actionable, sanitized signal.
- [ ] Alerts are test-fired and reach the responsible operator.
- [ ] Load and failure-injection results stay within the documented limits or produce a recorded capacity plan.

### 10.6 Private Staging and Advisory Rollout

- [ ] Deploy a private production-like staging environment using separate credentials, databases, GitHub App configuration, and OAuth callback URLs.
- [ ] Run real end-to-end GitHub OAuth, repository discovery/connection, webhook, retry, Check Run, comment, rerun, retention, and evidence-export journeys.
- [ ] Repeat desktop/mobile accessibility scans and complete a human keyboard and screen-reader usability pass.
- [ ] Verify the staging privacy boundary: no private identifiers or repository content enter generic source, fixtures, logs, screenshots, or documentation.
- [ ] Rehearse deployment rollback, database recovery, credential rotation, and GitHub App disablement.
- [ ] Launch production in advisory mode to a deliberately small allowlisted repository set with a documented stop condition.

Exit evidence:

- [ ] The release checklist is signed off with links to CI, staging smoke tests, migration/restore evidence, security scans, and rollback rehearsal.
- [ ] Production starts in advisory mode with enforcement bypass disabled and branch protection unchanged.
- [ ] Operators can disable webhook processing and GitHub publication quickly without deleting evidence.

### 10.7 Pilot Evidence and Enforcement Decision

- [ ] Collect at least five distinct representative reviewed pull requests with at least 95% successful full-coverage reliability.
- [ ] Record at least ten human-verified findings for any rule version proposed for enforcement and achieve at least 90% precision for that version.
- [ ] Resolve partial coverage and recurring operational failures before proposing a required check.
- [ ] Review false positives, suppressions, privacy impact, developer experience, incident readiness, and rollback ownership with stakeholders.
- [ ] Enable only proven deterministic rule versions; keep AI, policy, suppressed, and unproven findings advisory.
- [ ] Make the DiffGuard Check Run required only through a separate, deliberate GitHub branch-protection or ruleset change.

Exit evidence:

- [ ] The dashboard reports the pilot ready with no unresolved reliability or rule-evidence blocker.
- [ ] The enforcement decision and eligible rule versions are recorded and approved.
- [ ] A non-critical pull request proves both blocking and recovery behavior before broader rollout.

### Phase 10 Completion Criteria

- [ ] A clean release can be reproduced, deployed, observed, backed up, restored, rolled back, and disabled using documented procedures.
- [ ] Production secrets and repository data remain outside the generic repository and client-visible surfaces.
- [ ] Advisory production meets its operational and security gates.
- [ ] Enforced production remains impossible until the independent pilot and branch-protection gates are deliberately completed.

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
