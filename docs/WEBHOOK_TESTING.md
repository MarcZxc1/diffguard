# GitHub webhook testing

The webhook URL is `POST /api/webhook/github`. A browser sends `GET`, so seeing a 405 response in a browser is expected and confirms the path is reachable.

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

## Verify retry handling

Send the exact same signed request a second time with the same `x-github-delivery` value. The first request returns `200 Webhook received`; the retry returns `200 Webhook already processed`. Use a new delivery ID when starting another manual test.

## Response guide

| Response | Meaning | What to check |
| --- | --- | --- |
| `200 Webhook received` | Signature and supported event/action were accepted. | Backend logs should show the PR summary. |
| `200 Webhook already processed` | GitHub retried an accepted delivery ID. | The retry was acknowledged without starting duplicate review work. |
| `202 Event ignored` | Signature was valid but the event is not `pull_request`. | Set `x-github-event: pull_request`. |
| `202 Pull request action ignored` | Signature was valid but action is not `opened` or `synchronize`. | Check body `action`. |
| `400 Expected raw request body` | JSON content type or parser ordering is wrong. | Send `content-type: application/json`; keep router above `express.json()`. |
| `401 Invalid GitHub webhook signature` | HMAC does not match the raw body. | Recreate the signature, use the same secret, retain `sha256=`, and send unchanged body bytes. |
| `404` | ngrok forwards to a different server/path or the route was not mounted. | Confirm `ngrok http 3000` and the POST URL. |
| `405` | A GET request reached the endpoint. | Use POST; this is normal in a browser. |
