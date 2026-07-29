# Generic Repository Governance Implementation Plan

## Overview

Build an opt-in, domain-neutral governance policy layer on top of DiffGuard's existing repository rule configuration. It will evaluate pull-request context and changed paths without storing raw descriptions or embedding any private repository knowledge.

## Prerequisites

- Existing repository rule configuration and settings endpoint.
- Existing GitHub App Pull Requests and Checks permissions.
- Existing deterministic rule engine and policy/non-blocking boundary.
- Existing manager settings dashboard.

## Phase Summary

1. Define the configuration contract and deterministic governance rules.
2. Connect transient pull-request metadata to review processing.
3. Add a manager-facing governance settings editor.
4. Document, verify, and audit the generic/privacy boundary.

---

## Phase 1: Governance Contract and Rules

### Objective

Introduce strictly validated generic configuration and bounded advisory findings.

### Rationale

The contract establishes privacy, safety, and compatibility boundaries before external data is fetched.

### Tasks

- [x] Add a strict `governance` configuration schema with safe defaults and bounds.
- [x] Extend the rule context with optional transient pull-request metadata.
- [x] Add metadata, change-size, and protected-path test policies.
- [x] Keep all governance policies advisory and disabled by default.
- [x] Add positive, negative, boundary, and configuration-validation tests.

### Success Criteria

- Existing configurations parse unchanged.
- Governance produces no findings until enabled.
- Findings are bounded and contain no raw pull-request body.
- Invalid or unknown governance fields are rejected.

### Files Likely Affected

- `backend/src/services/rule-engine.ts`
- `backend/src/services/rule-engine.test.ts`

---

## Phase 2: Review Processing Integration

### Objective

Fetch authoritative pull-request metadata only for governance-enabled repositories and pass it to rules transiently.

### Rationale

This preserves data minimization and avoids adding API calls for repositories that do not use governance.

### Tasks

- [x] Detect enabled governance from the review-run configuration snapshot.
- [x] Fetch validated pull-request metadata with the existing installation token.
- [x] Pass only title/body into the in-memory rule context.
- [x] Preserve existing retry, failure sanitization, and Check Run behavior.
- [x] Document that raw descriptions are not persisted.

### Success Criteria

- Governance-disabled reviews retain their existing request path.
- Reviews use the authoritative GitHub metadata endpoint only when an enabled description, section, or issue-reference requirement needs it.
- No schema or persistence migration is required.

### Files Likely Affected

- `backend/src/services/review-processor.ts`
- `docs/CONTEXT.md`

---

## Phase 3: Dashboard Configuration

### Objective

Let repository managers configure governance without editing raw JSON.

### Rationale

A reusable policy system is only useful if managers can safely tailor it per repository.

### Tasks

- [x] Add frontend governance types and safe defaults.
- [x] Add an opt-in governance settings form.
- [x] Support required headings, issue references, file limits, protected paths, and test paths.
- [x] Use an explicit Save action and existing error handling.
- [x] Explain that governance findings are advisory.

### Success Criteria

- Existing repositories render with governance disabled.
- Managers can save valid generic policy settings.
- Repository changes refresh the form without leaking state across repositories.
- The frontend production build and lint pass.

### Files Likely Affected

- `frontend/src/App.tsx`

---

## Phase 4: Documentation, Verification, and Privacy Audit

### Objective

Prove the implementation works and contains no private-project coupling.

### Rationale

The privacy boundary is part of the feature contract, not a documentation afterthought.

### Tasks

- [x] Add generic configuration documentation and examples.
- [x] Update roadmap, walkthrough, development log, and test counts.
- [x] Run backend tests, typecheck, build, and Prisma validation.
- [x] Run frontend build and lint.
- [x] Scan tracked source and documentation for prohibited private identifiers.
- [x] Review the final diff for unrelated or sensitive content.

### Success Criteria

- All quality gates pass.
- The identifier audit returns no matches.
- No customer-specific paths, fixtures, examples, or names are present.
- Documentation states that native GitHub review controls remain separate.

### Files Likely Affected

- `README.md`
- `docs/CONTEXT.md`
- `docs/CODE_WALKTHROUGH.md`
- `docs/DEVELOPMENT_LOG.md`
- `docs/ROADMAP.md`
- `docs/generic-repository-governance/*`

---

## Post-Implementation

- [ ] Collect advisory evidence on authorized repositories.
- [ ] Tune configurations without changing generic source code.
- [ ] Consider a repository-owned configuration file only after permission and threat-model review.

## Notes

- This feature does not configure branch protection, assign reviewers, or replace CODEOWNERS.
- Governance rules remain `POLICY` findings and cannot fail an enforcing Check Run.
- No private repository is required for DiffGuard's generic implementation.
