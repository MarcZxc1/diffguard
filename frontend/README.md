# DiffGuard Frontend

This workspace contains the React operations dashboard. It is intentionally thin: GitHub credentials, repository authorization, rule execution, and evidence generation stay in the backend.

## Run it

From the repository root, copy `frontend/.env.example` to `frontend/.env`, then:

```bash
bun install
cd frontend
bun dev
```

Open `http://localhost:5173`. The backend normally runs at `http://localhost:3000`.

## Useful commands

```bash
bun run lint
bun run test
bun run build
```

For a real-browser accessibility pass, start the frontend and run:

```bash
bun run validate:a11y-browser
```

The validator launches an isolated Chrome session with generic fixture data. It checks desktop and 320px reflow, 200% text resizing, landmarks and heading order, control names, table captions, sequential keyboard access, visible focus, detail-panel focus restoration, and delayed loading announcements. It does not need project credentials or contact external repositories.

Chrome and Chromium are detected in their common Linux, macOS, and Windows locations. If yours lives elsewhere, set `DIFFGUARD_A11Y_CHROME_PATH` to the executable before running the command.

## Where things live

- `src/App.tsx` coordinates session and repository state.
- `src/components/` contains focused screens and dashboard panels.
- `src/lib/api.ts` is the credentialed API boundary and session-expiry signal.
- `src/lib/governance-policy.ts` contains policy defaults and rule-selection logic.
- `src/types.ts` contains shared API view models.

For the full setup, including PostgreSQL, Redis, and GitHub App configuration, read [`../docs/INSTALLATION.md`](../docs/INSTALLATION.md).
