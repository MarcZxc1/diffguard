# DiffGuard

DiffGuard is a GitHub pull-request review and SAST bot. It verifies signed pull-request webhooks, detects security risks with deterministic rules and an LLM, and posts focused review comments on changed lines.

## Project status

The current MVP foundation includes secure webhook signature verification and database-backed delivery deduplication. See [`docs/CONTEXT.md`](docs/CONTEXT.md) for the architecture, setup, API surface, and planned boundaries.

## Development

The backend uses Bun, Express, Prisma, PostgreSQL, and Redis. The frontend uses React, Vite, and Tailwind CSS. Test1.

Read the guides in [`docs/`](docs/README.md) before contributing. Local secrets belong in `backend/.env` and must never be committed.
