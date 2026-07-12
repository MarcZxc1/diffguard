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

## Optional LLM Review

LLM review is disabled by default and requires:

- repository setting `llmReviewEnabled: true`
- backend `OPENAI_API_KEY`
- optional `OPENAI_MODEL`, defaulting to `gpt-5.6-sol`

DiffGuard sends only bounded, redacted added-line context and uses strict structured output. OpenAI failures fail open and are recorded in review-run LLM state without blocking deterministic review.

## Evidence Export

Evidence export is explicit per PR and never automatic. Preview and download are authorized against the repository, rate-limited per user, and audited.

Exported Markdown includes PR metadata, source URL, export timestamp, review summary, and user-provided thesis relevance. It excludes GitHub tokens, webhook payloads, full diffs, complete patches, suspected credential values, and private logs.
