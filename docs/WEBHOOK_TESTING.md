# GitHub webhook testing

The webhook URL is `POST /api/webhook/github`. A browser sends `GET`, so seeing a 405 response in a browser is expected and confirms the path is reachable.

## Required GitHub App configuration

Configure the App with the smallest permissions used by the current MVP:

| Repository permission | Access | Why |
| --- | --- | --- |
| Metadata | Read-only | Granted automatically by GitHub for basic repository identity. |
| Pull requests | Read and write | Reads changed files and publishes inline review comments. |

Subscribe only to the **Pull request** repository event. DiffGuard currently processes the `opened` and `synchronize` actions; other events and actions receive a `202` ignored response. Install the App only on repositories that should be reviewed.

The App does not currently create Check Runs, read repository contents through the Contents API, or request organization permissions. Those settings belong to later roadmap phases and should not be granted early.

## Bruno request

Set these fields:

| Field | Value |
| --- | --- |
| Method | `POST` |
| URL | `https://<your-ngrok-domain>/api/webhook/github` |
| Body | Raw JSON copied byte-for-byte from `backend/src/payload.json` |
| `content-type` | `application/json` |
| `x-github-event` | `pull_request` |
| `x-github-delivery` | A new value, such as `bruno-test-001` |
| `x-hub-signature-256` | The complete generated `sha256=<64 hex characters>` value |
| `ngrok-skip-browser-warning` | `true` |

The signature header must include `sha256=` and all 64 hexadecimal characters. A truncated hash, a missing prefix, a changed whitespace character, or a re-formatted JSON body produces `401 Invalid GitHub webhook signature`.

## Generate a signature in fish

Run this from `backend/`. It signs the exact bytes in the sample payload and prints only the HMAC, not the secret.

```fish
set sig (bun -e '
import "dotenv/config";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const body = readFileSync("src/payload.json");
const secret = process.env.GITHUB_WEBHOOK_SECRET;

if (!secret) throw new Error("Missing GITHUB_WEBHOOK_SECRET");

process.stdout.write(
  "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")
);
')

echo $sig
```

Paste the output into Bruno's `x-hub-signature-256` value exactly as printed. Do not put quotation marks around it.

## Send the same request with curl

```fish
curl -i \
  -X POST "https://<your-ngrok-domain>/api/webhook/github" \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: $sig" \
  -H "x-github-event: pull_request" \
  -H "x-github-delivery: local-test-1" \
  -H "ngrok-skip-browser-warning: true" \
  --data-binary @src/payload.json
```

`--data-binary` matters: it sends the file bytes without curl changing the body. If the payload file changes, regenerate the signature before sending again.

## Run the local test script

To avoid manually copying a multiline `curl` command, run this from `backend/`:

```fish
fish scripts/test-github-webhook.fish
```

The script creates a new delivery ID, signs the exact sample payload bytes, and posts them to `http://localhost:3000/api/webhook/github`. Set `WEBHOOK_URL` when testing through ngrok, or `DELIVERY_ID` when you deliberately want to send the same delivery twice.

## Verify durable queue and retry handling

Send the exact same signed request a second time with the same `x-github-delivery` value. The first request returns `202 Webhook queued` with a `reviewRunId`. The retry returns `200 Webhook already registered` with that same ID and its actual current state. A failed run is never described as successfully processed.

Use an admin JWT to inspect the durable result:

```fish
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/api/review-runs/<review-run-id>"
```

The response exposes `QUEUED`, `PROCESSING`, `SUCCEEDED`, `PARTIAL`, or `FAILED`, attempt counts, sanitized failure category/message, analyzed/skipped file counts, and findings. It never returns installation tokens, full patches, or suspected credential values.

Retryable network, timeout, rate-limit, and GitHub 5xx failures automatically return to `QUEUED` with bounded backoff until three attempts are exhausted. Replaying a delivery for a retryable recorded failure can requeue it without deleting database rows. Comment retries search GitHub for the finding's HMAC-authenticated hidden marker before posting.

## Response guide

| Response | Meaning | What to check |
| --- | --- | --- |
| `202 Webhook queued` | The supported delivery and review run committed atomically. | Use the returned `reviewRunId`; GitHub API work happens in the worker. |
| `200 Webhook already registered` | GitHub retried an existing delivery ID. | Inspect the returned real run state; no second run is created. |
| `202 Repository is disabled` | The installation or repository is persisted but disabled. | Enable it intentionally before expecting review work. |
| `503 Unable to queue GitHub review` | Durable persistence failed, so no success acknowledgement was sent. | GitHub may retry; check PostgreSQL health without deleting delivery state. |
| `202 Event ignored` | Signature was valid but the event is not `pull_request`. | Set `x-github-event: pull_request`. |
| `202 Pull request action ignored` | Signature was valid but action is not `opened` or `synchronize`. | Check body `action`. |
| `400 Expected raw request body` | JSON content type or parser ordering is wrong. | Send `content-type: application/json`; keep router above `express.json()`. |
| `400 Incomplete pull request payload` | Installation, repository, PR, or head revision identity is invalid. | Use the unmodified GitHub App payload and supported action. |
| `401 Invalid GitHub webhook signature` | HMAC does not match the raw body. | Recreate the signature, use the same secret, retain `sha256=`, and send unchanged body bytes. |
| `404` | ngrok forwards to a different server/path or the route was not mounted. | Confirm `ngrok http 3000` and the POST URL. |
| `405` | A GET request reached the endpoint. | Use POST; this is normal in a browser. |
