---
name: github-webhook-debugging
description: Diagnose, test, or extend DiffGuard's GitHub webhook endpoint, including ngrok routing, HMAC SHA-256 signatures, Bruno/curl requests, raw-body middleware ordering, event filtering, and delivery failures such as 401, 404, or 405 responses.
---

# GitHub webhook debugging

Read `docs/WEBHOOK_TESTING.md` and inspect `backend/src/index.ts`, `backend/src/routes/github-webhooks.routes.ts`, and `backend/src/lib/github-webhook.ts` before changing webhook behavior.

## Diagnostic order

1. Confirm the request is `POST https://<ngrok-domain>/api/webhook/github` and ngrok forwards to API port `3000`.
2. Confirm `content-type: application/json`, `x-github-event`, `x-github-delivery`, and `x-hub-signature-256` exist.
3. Generate an HMAC from `backend/src/payload.json` using `backend/.env`; sign exact file bytes and retain the complete `sha256=` prefix.
4. Compare the sent body byte-for-byte with what was signed. Reformatting, whitespace, or a new line changes the HMAC.
5. Confirm the webhook router is mounted before `express.json()` and uses `express.raw({ type: "application/json" })` for the endpoint.
6. Verify the signature before `JSON.parse`, then filter event and action afterward.

## Response interpretation

- `401`: body, secret, signature prefix, or full hash does not match.
- `404`: ngrok target, URL, or route mount is wrong.
- `405`: a browser sent GET; use POST.
- `400`: check content type, raw parser, JSON, and delivery id.
- `202`: signature succeeded; the event or action was deliberately ignored.

Never log or return the webhook secret. Prefer tests that construct signatures from a test secret rather than values from `.env`.
