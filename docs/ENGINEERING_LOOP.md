# DiffGuard engineering loop

Use this loop for every change. The goal is to keep an agent useful without letting it blindly widen scope or hide learning from you.

## The loop

1. **Orient**: read `docs/CONTEXT.md`, the affected files, nearby tests, and the current diff. State the behavior being changed and its boundary.
2. **Baseline**: run the narrowest relevant check before editing. Record pre-existing failures separately from new failures.
3. **Plan**: define acceptance criteria, the files expected to change, and the smallest test that proves the behavior.
4. **Implement**: follow existing route/controller/service patterns. Keep secret values out of code, docs, logs, and commits.
5. **Explain**: add a short code comment only where intent is not obvious from the code itself: security checks, ordering constraints, cache invalidation, external API contracts, or non-obvious trade-offs.
6. **Verify**: run focused tests first, then typecheck/build for every affected workspace. Exercise HTTP integrations with a real request where practical.
7. **Inspect**: review the diff for accidental generated files, secrets, broken API contracts, unrelated formatting, and missing error cases.
8. **Document**: update context, walkthrough, or webhook docs when the architecture, API, command, environment, or developer workflow changes.

## Definition of done

A change is done only when all applicable statements are true:

- The requested behavior is implemented with an explicit success and failure path.
- The narrow test passes, and broader checks have been run or their existing failures are named.
- The endpoint, UI state, schema, or webhook contract matches its documentation.
- New non-obvious code includes a concise reason-oriented comment.
- No secrets, `.env` values, tokens, or signed production payloads appear in the diff.

## Comment standard

Prefer a comment that explains *why*:

```ts
// GitHub signs the original bytes, so parsing JSON first would invalidate the HMAC.
app.use("/api/webhook", githubWebhookRouter);
```

Avoid comments that merely repeat the code:

```ts
// Set the token.
setToken(data.token);
```

## Change templates

For a backend endpoint: route -> validation -> controller -> service -> Prisma -> focused test -> API docs.

For a database change: schema -> migration/push -> TypeScript callers -> test -> context update.

For a frontend feature: typed API client -> loading/error/empty/success states -> responsive UI -> build -> walkthrough update.

For a GitHub integration: raw-body signature test -> delivery id -> idempotency strategy -> event/action filter -> asynchronous work -> observable result.

## Current baseline

Phase 0 requires backend tests, backend typecheck/build, and the frontend build to pass together. The GitHub Actions workflow runs the same checks for every pull request and push to `main`.
