#!/usr/bin/env fish

set -l backend_dir (realpath (dirname (status filename))/..)
set -l payload "$backend_dir/src/payload.json"

if not set -q WEBHOOK_URL
    set WEBHOOK_URL http://localhost:3000/api/webhook/github
end

if not set -q DELIVERY_ID
    set DELIVERY_ID "local-test-"(date +%s)
end

cd "$backend_dir"; or exit 1

set -l signature (bun -e '
import "dotenv/config";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const body = readFileSync("src/payload.json");
const secret = process.env.GITHUB_WEBHOOK_SECRET;

if (!secret) throw new Error("Missing GITHUB_WEBHOOK_SECRET");

process.stdout.write(
  "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex"),
);
')

if test $status -ne 0
    exit 1
end

curl -i -X POST "$WEBHOOK_URL" \
    -H "content-type: application/json" \
    -H "x-github-event: pull_request" \
    -H "x-github-delivery: $DELIVERY_ID" \
    -H "x-hub-signature-256: $signature" \
    --data-binary "@$payload"
