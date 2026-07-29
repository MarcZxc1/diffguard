# DiffGuard

DiffGuard is a GitHub pull-request review and SAST bot. It verifies signed pull-request webhooks, detects security risks with deterministic rules and an optional LLM, evaluates opt-in repository governance policies, and posts focused review results.

## The problem I am solving

Security review often arrives too late or produces so much noise that developers stop trusting it. Traditional scanners can report issues far away from the code a pull request actually changed, while AI-only reviewers may sound confident without being consistent enough to block a merge. Teams are then left with two poor choices: ignore the warnings or enforce them before anyone knows how reliable they are.

I want security feedback to feel like a useful teammate in the pull-request conversation—not another dashboard full of unexplained alerts.

## My solution

DiffGuard reviews the code that changed and puts focused findings directly on the relevant pull-request lines. Deterministic rules handle security checks that need predictable, repeatable behavior. Optional AI review adds context and suggestions, but stays advisory so an uncertain response cannot block someone’s work.

Most importantly, DiffGuard earns the right to enforce. A repository begins in advisory mode while the team collects real evidence: review coverage, successful runs, and human decisions about whether findings were correct or false positives. Only rule versions with enough verified evidence can fail a Check Run. This makes enforcement a decision backed by the team’s own results instead of a switch they are asked to trust blindly.

For demonstrations and local testing, a development-only bypass lets contributors exercise the enforcing workflow before the pilot is complete. It is clearly labeled, audited, does not alter the real pilot numbers, and is rejected in production.

## Project status

The current MVP includes durable webhook processing, versioned deterministic review rules, optional structured AI review, GitHub Check Runs, precision-gated enforcement, repository-scoped operations, and generic opt-in pull-request governance. Governance configuration is stored per repository, while pull-request descriptions are evaluated transiently and are not persisted by the review workflow.

DiffGuard remains advisory until repository-specific evidence demonstrates sufficient reliability and precision. See [`docs/CONTEXT.md`](docs/CONTEXT.md) for the architecture, setup, API surface, and boundaries.

## Development

The backend uses Bun, Express, Prisma, PostgreSQL, and Redis. The frontend uses React, Vite, and Tailwind CSS.

To run it locally:

```bash
bun install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cd backend && docker compose up -d && bun run db:push
cd ..
bun dev
```

Then open `http://localhost:5173`. The example environment files contain placeholders; replace the local secrets before starting and never commit the resulting `.env` files.

The friendly step-by-step version—including GitHub App setup, validation commands, and common fixes—is in [`docs/INSTALLATION.md`](docs/INSTALLATION.md). The rest of the project guides are indexed in [`docs/README.md`](docs/README.md).
