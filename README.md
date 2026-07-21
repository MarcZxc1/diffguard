# DiffGuard

DiffGuard is a GitHub pull-request review and SAST bot. It verifies signed pull-request webhooks, detects security risks with deterministic rules and an LLM, and posts focused review comments on changed lines.

## The problem we are solving

Security review often arrives too late or produces so much noise that developers stop trusting it. Traditional scanners can report issues far away from the code a pull request actually changed, while AI-only reviewers may sound confident without being consistent enough to block a merge. Teams are then left with two poor choices: ignore the warnings or enforce them before anyone knows how reliable they are.

We want security feedback to feel like a useful teammate in the pull-request conversation—not another dashboard full of unexplained alerts.

## Our solution

DiffGuard reviews the code that changed and puts focused findings directly on the relevant pull-request lines. Deterministic rules handle security checks that need predictable, repeatable behavior. Optional AI review adds context and suggestions, but stays advisory so an uncertain response cannot block someone’s work.

Most importantly, DiffGuard earns the right to enforce. A repository begins in advisory mode while the team collects real evidence: review coverage, successful runs, and human decisions about whether findings were correct or false positives. Only rule versions with enough verified evidence can fail a Check Run. This makes enforcement a decision backed by the team’s own results instead of a switch they are asked to trust blindly.

For demonstrations and local testing, a development-only bypass lets contributors exercise the enforcing workflow before the pilot is complete. It is clearly labeled, audited, does not alter the real pilot numbers, and is rejected in production.

## Project status

The current MVP foundation includes secure webhook signature verification and database-backed delivery deduplication. See [`docs/CONTEXT.md`](docs/CONTEXT.md) for the architecture, setup, API surface, and planned boundaries.

## Development

The backend uses Bun, Express, Prisma, PostgreSQL, and Redis. The frontend uses React, Vite, and Tailwind CSS.

Read the guides in [`docs/`](docs/README.md) before contributing. Local secrets belong in `backend/.env` and must never be committed.
