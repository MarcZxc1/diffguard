# Frontend Hardening Implementation Plan

## Overview

This plan hardens the generic DiffGuard operations dashboard without embedding any organization, customer, repository layout, or domain-specific data.

## Prerequisites

- Preserve the current uncommitted governance implementation.
- Keep Bearer authentication compatible for non-browser API clients.
- Keep governance findings advisory and outside the security enforcement gate.
- Run focused tests after each phase and the complete repository verification suite at the end.

## Phase Summary

1. Secure browser authentication and session expiry.
2. Make repository reads and settings writes race-safe.
3. Make governance activation deterministic and transparent.
4. Correct static accessibility and interaction issues.
5. Add frontend regression tests and CI enforcement.

---

## Phase 1: Browser Session Hardening

### Objective

Replace JavaScript-readable browser token persistence with a short-lived HttpOnly cookie.

### Tasks

- [x] Extract shared backend session cookie helpers.
- [x] Issue cookies from password and GitHub OAuth authentication.
- [x] Accept either the cookie or a Bearer token in authentication middleware.
- [x] Add session bootstrap and logout endpoints.
- [x] Validate the exact frontend origin for state-changing cookie-authenticated requests.
- [x] Remove frontend `localStorage` token persistence and centralize `401` handling.
- [x] Add backend authentication middleware tests.

### Success Criteria

The browser authenticates through `credentials: "include"`, cannot read the credential from JavaScript storage, signs out cleanly, and transitions to sign-in when a protected request returns `401`.

### Files Likely Affected

- `backend/src/controllers/auth.controller.ts`
- `backend/src/middlewares/auth.middleware.ts`
- `backend/src/routes/auth.routes.ts`
- `frontend/src/App.tsx`
- `frontend/src/lib/api.ts`

---

## Phase 2: Race-Safe Repository State

### Objective

Ensure only the newest repository request can update the selected view and settings cannot overwrite fresher state.

### Tasks

- [x] Make repository loading abortable and latest-request-wins.
- [x] Reset repository-specific views immediately when selection changes.
- [x] Stabilize effect dependencies.
- [x] Serialize settings writes.
- [x] Use functional state merges.
- [x] Commit retention changes on blur rather than every keystroke.

### Success Criteria

Late responses are ignored, polling cleanup aborts in-flight work, lint has no hook dependency warnings, and settings controls cannot create overlapping writes.

### Files Likely Affected

- `frontend/src/App.tsx`
- `frontend/src/lib/api.ts`

---

## Phase 3: Governance Configuration Safety

### Objective

Prevent an enabled governance policy from being silently excluded by an explicit rule allowlist.

### Tasks

- [x] Extract governance types, defaults, and active-rule calculation.
- [x] Add active governance rule IDs to an existing explicit allowlist.
- [x] Explain LOW-severity filtering in the UI.
- [x] Preserve all unrelated rule configuration.
- [x] Add focused configuration tests.

### Success Criteria

Saving an enabled governance policy activates its applicable rules under an explicit allowlist and visibly warns when a severity threshold still filters advisory findings.

### Files Likely Affected

- `frontend/src/components/GovernancePolicySettings.tsx`
- `frontend/src/lib/governance-policy.ts`
- `frontend/src/App.tsx`

---

## Phase 4: Accessible Interaction States

### Objective

Correct the static accessibility and form interaction findings from the audit.

### Tasks

- [x] Associate labels with all evidence controls.
- [x] Announce errors, loading states, and stale status.
- [x] Add data-table captions.
- [x] Add review-detail focus entry and focus restoration.
- [x] Add authentication autocomplete, required, pending, and error semantics.
- [x] Use explicit button types and descriptive document metadata.

### Success Criteria

All form controls have accessible names, asynchronous status is announced appropriately, data tables are identifiable, and the review-detail interaction has deterministic focus behavior.

### Files Likely Affected

- `frontend/src/App.tsx`
- `frontend/index.html`

---

## Phase 5: Regression Protection and CI

### Objective

Make frontend correctness enforceable on every pull request.

### Tasks

- [x] Configure Vitest with jsdom and React Testing Library.
- [x] Test cookie API behavior and centralized session expiry.
- [x] Test governance allowlist calculation.
- [x] Test accessible authentication failure and stale repository response handling.
- [x] Add frontend lint and tests to CI.
- [x] Update project documentation and recorded verification results.

### Success Criteria

Frontend tests, lint, typecheck/build, the backend suite, database schema validation, and dependency audit all pass.

### Files Likely Affected

- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/src/**/*.test.ts`
- `.github/workflows/ci.yml`
- `docs/frontend-hardening/PROGRESS.md`
- project documentation

## Post-Implementation

- [x] Run a live authenticated accessibility scan with a controlled local browser fixture.
- [x] Perform keyboard, semantic screen-reader, contrast, mobile, text-resize, and slow-network testing.
- [ ] Consider refresh-token rotation if longer browser sessions become necessary.

## Notes

The implementation intentionally avoids customer-specific names, paths, issue formats, protected data, and credentials.
