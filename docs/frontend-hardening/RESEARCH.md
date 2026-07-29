# Frontend Hardening Research

## Overview

DiffGuard's frontend is a functional React operations dashboard. The hardening work focuses on preventing stale data, protecting browser credentials, making repository policy behavior explicit, improving accessibility, and adding regression coverage without introducing repository-specific knowledge.

## Problem Statement

The production build passes, but the frontend currently has no automated tests and CI only builds it. Repository loads and settings writes can overlap, the browser persists a JWT in `localStorage`, expired sessions are not handled centrally, and several dynamic states are not announced or labeled accessibly.

## User Stories / Use Cases

- A manager can switch repositories quickly without an older response replacing the selected repository.
- A manager receives an explicit signed-out state when the session expires.
- A browser session does not expose its credential through JavaScript-readable persistent storage.
- Enabling governance cannot silently leave its active rules outside an explicit rule allowlist.
- Keyboard and assistive-technology users can identify form fields, errors, loading states, and data tables.
- Contributors receive fast frontend test and lint feedback in every pull request.

## Technical Research

### Approach Options

1. Keep browser Bearer tokens and add a strict Content Security Policy.
   - Smallest backend change.
   - Leaves the credential readable by any successful script injection.
2. Issue the existing short-lived JWT in an HttpOnly cookie.
   - Removes JavaScript access to the credential.
   - Works with the existing stateless authorization model and exact-origin credentialed CORS.
   - Requires a session bootstrap/logout endpoint and cookie-aware middleware.
3. Introduce stateful server sessions and refresh tokens.
   - Strong revocation and long-lived session capabilities.
   - Requires new persistence, rotation, cleanup, and migration work that is larger than this hardening pass.

### Recommended Approach

Use option 2. Keep Bearer-token acceptance for non-browser API compatibility, but make the browser use a 15-minute HttpOnly, SameSite=Lax cookie with Secure enabled in production. Add exact-origin validation for state-changing cookie-authenticated requests. Centralize frontend API handling so any protected `401` transitions the application to an anonymous state.

Use abortable, latest-request-wins repository loading and functional state updates. Serialize settings writes and commit number fields on blur instead of every keystroke. When governance is enabled under an explicit rule allowlist, merge only the active governance rule IDs and explain the behavior in the UI.

Add Vitest, jsdom, and React Testing Library. Cover authentication behavior, API credential handling, repository request races, policy configuration, and accessible errors/labels.

## UI/UX Considerations

- Keep loading, empty, error, stale, and success states distinct.
- Disable controls while their settings request is active.
- Announce asynchronous errors and loading states.
- Add explicit labels to evidence controls and captions to data tables.
- Move focus into the review detail region when it opens and restore focus when it closes.
- Explain governance allowlist and LOW-severity behavior before saving.

## Integration Points

- `backend/src/controllers/auth.controller.ts`
- `backend/src/middlewares/auth.middleware.ts`
- `backend/src/routes/auth.routes.ts`
- `frontend/src/App.tsx`
- `frontend/src/lib/api.ts`
- `.github/workflows/ci.yml`

## Risks and Challenges

- Cross-site frontend/API deployments cannot use SameSite=Lax credentialed fetches. Production should deploy both origins on the same site or explicitly design a CSRF-protected SameSite=None configuration.
- Short-lived cookies intentionally require a new sign-in after expiry; refresh-token rotation is outside this pass.
- Existing uncommitted governance work must be preserved while refactoring `App.tsx`.
- A DOM emulator catches interaction regressions but does not replace real browser, keyboard, screen-reader, responsive, or contrast testing.

## Open Questions

- Whether a later phase should add server-side refresh-token rotation and explicit session revocation.
- Which authenticated staging URL should be used for full live accessibility and end-to-end testing.

## References

- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies
- https://react.dev/reference/react/useEffect
- https://www.w3.org/WAI/tutorials/forms/labels/
- https://www.w3.org/WAI/tutorials/forms/notifications/
- https://www.w3.org/WAI/tutorials/tables/caption-summary/
- https://vitest.dev/guide/environment.html
- https://testing-library.com/docs/react-testing-library/setup/
