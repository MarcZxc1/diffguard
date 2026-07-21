# DiffGuard Operations Runbook

## Health Checks

- `GET /api/health` verifies PostgreSQL connectivity with `SELECT 1`.
- Review-run health is visible from the dashboard and `GET /api/repositories/:id/metrics`.
- A rising `githubFailureCount`, retry rate, or skipped-file count should be investigated before enabling any required branch protection.

## Migrations

Fresh environments:

```fish
cd backend
bun run db:migrate
```

Existing local databases that were created with `prisma db push` before migrations were introduced must be baselined first. Follow `docs/CONTEXT.md` and do not run `migrate deploy` against a non-empty unbaselined database.

## Backups

Back up PostgreSQL before deploying migrations or pruning retention data:

```fish
docker compose exec qwykz-db pg_dump -U postgres -d diffguard-backend > diffguard-backup.sql
```

Store backups outside the container volume and protect them as sensitive operational data. Backups include review metadata and findings, but should not include GitHub tokens because DiffGuard does not persist installation tokens.

## Retention

Each repository has `retentionDays` with a default of 90 days. Authorized users can run:

```text
POST /api/repositories/:id/retention/prune
```

The prune action deletes expired review runs and cascades their findings. It writes an audit log entry with the cutoff and deleted count.

## GitHub App Permissions

Required repository permissions:

- Metadata: read-only
- Pull requests: read and write
- Checks: read and write

Subscribe to the Pull request event only. Do not grant Contents, organization, or broader permissions unless a later roadmap item explicitly requires them.

## GitHub User OAuth Lifecycle

The user OAuth web flow uses state validation and S256 PKCE. Access tokens and optional refresh tokens are stored only as AES-256-GCM ciphertext. If GitHub supplies expiry metadata, DiffGuard refreshes the token within one minute of expiry and persists the rotated access/refresh pair atomically.

Existing non-expiring OAuth tokens remain compatible because their expiry fields are null. When a refresh token has expired, GitHub rejects the refresh grant, or a user API call returns `401`, DiffGuard clears only the matching token record and returns `GITHUB_REAUTH_REQUIRED`. The dashboard then shows **Reconnect GitHub**. A GitHub `5xx` or rate-limit response does not clear a valid stored grant.

Production deployments should keep `GITHUB_CLIENT_SECRET` and `GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY` in a secret manager, enable expiring user-to-server tokens for the GitHub App, and monitor repeated refresh failures without logging token request or response bodies. See GitHub's [user access token refresh documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

## Optional LLM Review

LLM review is disabled by default and requires:

- repository setting `llmReviewEnabled: true`
- backend `OPENAI_API_KEY`
- optional `OPENAI_MODEL`, defaulting to `gpt-5.6-sol`

DiffGuard sends only bounded, redacted added-line context and uses strict structured output. OpenAI failures fail open and are recorded in review-run LLM state without blocking deterministic review.

## Advisory Pilot

Use [the Phase 6 pilot runbook](PILOT.md) to collect and classify real-repository evidence. The dashboard keeps enforcement locked until the target has at least five distinct reviewed PRs, 95% successful full-coverage runs, and at least one deterministic rule version with ten verified findings at 90% precision or better.

For local development demonstrations only, `DIFFGUARD_DEV_ENFORCEMENT_BYPASS=true` permits the transition and makes all deterministic security rule versions enforceable when `NODE_ENV=development`. It does not change the recorded pilot status, evidence, eligible-rule count, or blockers; each bypass-assisted transition is audited. The backend rejects this setting at startup when `NODE_ENV=production`.

Switching the repository to `ENFORCING` does not modify GitHub branch protection. Make the DiffGuard Check Run required in GitHub only after reviewing the pilot evidence and exercising enforcement on a non-critical pull request.

## Evidence Export

Evidence export is explicit per PR and never automatic. Preview and download are authorized against the repository, rate-limited per user, and audited.

Exported Markdown includes PR metadata, source URL, export timestamp, review summary, and user-provided thesis relevance. It excludes GitHub tokens, webhook payloads, full diffs, complete patches, suspected credential values, and private logs.
