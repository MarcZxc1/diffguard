# Install and Run DiffGuard

You can have the dashboard running locally in a few minutes. GitHub integration can wait until the basic app is healthy, so start small and add credentials only when you need them.

## What you need

- [Bun](https://bun.sh/) 1.3 or newer
- Docker with Compose for the easiest PostgreSQL and Redis setup
- Git, plus a browser
- A GitHub App only when you are ready to review real pull requests

## 1. Install the code

Clone your repository, open its directory, and install the workspace dependencies:

```bash
git clone <your-repository-url>
cd diffguard
bun install
```

If you already have the code, just run `bun install` from the repository root.

## 2. Start PostgreSQL and Redis

The included Compose file keeps both services local:

```bash
cd backend
docker compose up -d
```

You can use managed services instead. If you do, replace `DATABASE_URL` and `REDIS_URL` in the next step.

## 3. Create local environment files

Copy the safe examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Replace `JWT_SECRET` and `GITHUB_WEBHOOK_SECRET` with your own random development values. A simple option is:

```bash
openssl rand -hex 32
```

Do not commit either `.env` file. The examples contain placeholders only; real GitHub, database, and AI credentials belong in local secret files or a deployment secret manager.

## 4. Prepare the database

From the repository root:

```bash
cd backend
bun run db:push
cd ..
```

This waits for PostgreSQL, generates the Prisma client, and applies the current development schema.

## 5. Start the app

The simplest command starts both workspaces:

```bash
bun dev
```

If you prefer separate logs, use two terminals:

```bash
cd backend
bun dev
```

```bash
cd frontend
bun dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:3000`, and `http://localhost:3000/api/health` should report a healthy database connection.

Create a local account from the sign-in screen. The browser session is held in a short-lived HttpOnly cookie, so you may be asked to sign in again after it expires.

## Connect GitHub when you are ready

The local account and dashboard work without GitHub OAuth, but repository discovery and pull-request review need a GitHub App.

Configure the App with:

- Repository metadata: read
- Pull requests: read and write
- Checks: read and write
- Event subscription: Pull request
- Webhook URL: your public backend URL followed by `/api/webhook/github`
- OAuth callback URL: your backend URL followed by `/api/auth/github/callback`

For local webhook delivery, expose port 3000 through a trusted tunnel and use that HTTPS URL. Put the App ID, private-key path, OAuth client values, and webhook secret in `backend/.env`, then restart the backend.

The browser never receives the GitHub App private key, installation token, or stored GitHub OAuth token.

## Check your work

Run the same checks used by CI:

```bash
cd backend
bun test
bun run typecheck
bun run build
bun run db:validate

cd ../frontend
bun run lint
bun run test
bun run build
bun run validate:a11y-browser
```

The browser accessibility validator uses generic fixture data in an isolated local Chrome session. It does not require GitHub, AI, or project-specific credentials.
If Chrome is installed in a nonstandard location, set `DIFFGUARD_A11Y_CHROME_PATH` to its executable.

## Common snags

- **The API cannot connect to PostgreSQL:** confirm `docker compose ps` is healthy and `DATABASE_URL` uses port `54519`.
- **Redis connection errors:** confirm the Redis container is running and `REDIS_URL` uses port `63707`.
- **The browser signs in but API calls fail:** `FRONTEND_URL` must exactly match the browser origin, normally `http://localhost:5173`.
- **Cookies do not work in production:** serve the app over HTTPS and keep the frontend and API on the same site. Cross-site deployment requires a deliberate SameSite=None and CSRF design.
- **GitHub sends no reviews:** verify the App installation, Pull request event subscription, webhook secret, and minimum permissions above.

For deployment, backup, retention, and secret-handling guidance, continue with [OPERATIONS.md](OPERATIONS.md).
