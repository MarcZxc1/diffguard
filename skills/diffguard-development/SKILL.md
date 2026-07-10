---
name: diffguard-development
description: Implement, review, test, or document changes in the DiffGuard Bun, Express, Prisma, Redis, React, and GitHub-webhook repository. Use for backend features, frontend features, API changes, schema changes, authentication, tests, learning-oriented code comments, and project documentation.
---

# DiffGuard development

Read `docs/CONTEXT.md` first. Read `docs/CODE_WALKTHROUGH.md` for the affected subsystem and follow `docs/ENGINEERING_LOOP.md` for every change.

## Workflow

1. Inspect the current diff and the files nearest to the requested behavior before editing.
2. State the target behavior, affected boundary, acceptance criteria, and test command.
3. Preserve the repository shape: routes select middleware, controllers validate and respond, services own reusable persistence/cache work, and `lib/` owns shared clients or crypto.
4. Keep the GitHub webhook route above `express.json()` and verify its signature from the raw buffer before parsing JSON.
5. Use Zod for external request validation and `HttpError` for expected client errors.
6. Add concise comments only for non-obvious intent: security constraints, ordering, cache invalidation, or external protocol requirements.
7. Run focused tests, then typecheck/build for affected workspaces. Name any pre-existing failure separately.
8. Update the appropriate document when an API, setup command, environment variable, architecture boundary, or workflow changes.

## Guardrails

- Never expose `.env` values, JWTs, secrets, or real webhook signatures.
- Prefer typed frontend models over `any` in new code.
- Do not hide a failing check by weakening types, removing validation, or deleting a test.
- Treat the documented admin create-user/password mismatch as existing debt until the contract is deliberately redesigned.
