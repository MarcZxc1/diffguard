# DiffGuard Rules

This project is documented for readers evaluating the open-source codebase and the research use of the tool. The rules below are the deterministic checks DiffGuard runs on changed lines in pull requests. They are heuristics, not proofs.

## How the rules work

DiffGuard scans added lines in changed files, looks for patterns that are commonly risky, and emits findings with evidence, explanation, remediation, severity, and confidence. The point is to catch high-signal issues early without pretending automated review can replace human judgment.

Rules can be enabled, suppressed, or filtered by repository configuration. Findings can also be reviewed later during the pilot phase to measure precision.

## Security rules

### `security.hardcoded-secret`

Looks for credential-like values committed directly in source or configuration files.

Why it matters:

- Secrets in git history are hard to remove.
- Copied values can reach logs, screenshots, exports, and deployments.
- Real secrets may be reused across systems.

Typical examples:

- API keys
- access tokens
- client secrets
- passwords written as literals

What to do instead:

- Move the value to an environment variable or secret manager.
- Rotate it if it was ever active.

### `security.unsafe-sql-construction`

Looks for SQL built with string interpolation or unsafe raw-query APIs.

Why it matters:

- Interpolated SQL can let untrusted data change the query structure.
- Raw SQL helpers often bypass parameter binding.

Typical examples:

- `SELECT ... ${value}`
- `$queryRawUnsafe(...)`
- `$executeRawUnsafe(...)`

What to do instead:

- Use parameterized queries.
- Prefer tagged-template query helpers when the client supports them.

### `security.dynamic-command-execution`

Looks for shell or system command execution that includes dynamic input.

Why it matters:

- Shell parsing can reinterpret user input as extra arguments or commands.
- The risk is highest when input comes from requests, forms, or other external sources.

Typical examples:

- `exec(...)`
- `execSync(...)`
- `system(...)`
- `popen(...)`

What to do instead:

- Use a fixed executable with an argument array.
- Validate values against a strict allowlist.
- Avoid a shell when possible.

### `security.untrusted-path`

Looks for request-derived data used in filesystem or path operations.

Why it matters:

- Path traversal can escape the intended directory.
- Absolute or relative escape paths can expose or overwrite unexpected files.

Typical examples:

- request data passed into `readFile`, `writeFile`, `sendFile`, or stream creation
- request data used in `path.join` or `path.resolve`

What to do instead:

- Resolve against a fixed base directory.
- Reject traversal and absolute paths.
- Verify the resolved path stays within the allowed root.

### `security.explicit-auth-bypass`

Looks for flags or configuration that appear to disable authentication.

Why it matters:

- A single permissive flag can expose a route or operation.
- Bypass toggles are easy to forget in committed code.

Typical examples:

- `skipAuth = true`
- `disableAuth = true`
- `authenticationRequired = false`

What to do instead:

- Keep normal auth middleware in the request path.
- If a route is intentionally public, document and test that decision.

### `security.permissive-cors`

Looks for broad cross-origin configuration.

Why it matters:

- Overly broad CORS can expose authenticated APIs to untrusted browser contexts.
- It often appears harmless during development and then ships unchanged.

Typical examples:

- `origin: "*"`
- `credentials: true` with a wide origin allowlist
- permissive origin regexes

What to do instead:

- Allow only known origins.
- Keep credentials and origin policy narrowly scoped.

### `security.unvalidated-request-write`

Looks for request input written to persistence without validation.

Why it matters:

- Unvalidated writes can corrupt data.
- They can store malicious payloads that later affect other systems.

Typical examples:

- `create({ data: req.body })`
- `update({ data: req.query })`
- direct writes from request objects

What to do instead:

- Validate request bodies with a schema.
- Map validated fields into the database write explicitly.

## Policy rule

### `policy.source-change-without-tests`

Looks for source changes that do not appear to have matching test changes.

Why it matters:

- It is a practical signal that behavior changed without a nearby regression check.
- It is not a proof of failure, only a reminder to inspect coverage.

What to do instead:

- Add or update tests for changed behavior.
- Keep this rule advisory; it is meant to support review, not block it blindly.

## Future policy idea

A later phase may add style-oriented policy checks, including naming conventions for variables, functions, files, and folders.

One likely rule shape:

- multi-word JavaScript and TypeScript identifiers should use `camelCase`
- classes should use `PascalCase`
- constants should use `UPPER_SNAKE_CASE`
- files and folders should follow the repo's documented naming convention

Why this is future work:

- style rules are useful for consistency, but they are not security findings
- they need a repo-specific convention before enforcement makes sense
- they should stay advisory until the team is comfortable with the signal quality

## Limits

These rules are intentionally focused. They are designed to catch specific patterns with high confidence, not to claim complete vulnerability coverage. A safe PR may still be flagged if the pattern looks risky in context, and a risky PR can still escape detection if it uses an unfamiliar shape.

During the pilot, DiffGuard measures precision on real repositories before any finding becomes a blocking check.
