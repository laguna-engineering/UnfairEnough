---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security, phase2]
dependencies: []
---

# Cookie name mismatch breaks cookie-based auth

## Problem Statement
The auth middleware reads cookie `'session'` but the login endpoint sets cookie `'ue_session'`. Cookie-based authentication is completely broken — every admin panel API call returns 401 after login.

## Findings
- `apps/server/src/auth/middleware.ts:38` — `getCookie(c, 'session')`
- `apps/server/src/routes/auth.ts:8` — `const SESSION_COOKIE = 'ue_session'`
- `/auth/me` has its own inline extraction using the correct name, masking the bug during manual testing
- Flagged by all 5 review agents independently

## Proposed Solutions

### Option A: Shared constant (recommended)
Create `apps/server/src/auth/constants.ts` with `export const SESSION_COOKIE = 'ue_session'` and import in both middleware.ts and auth.ts.
- Effort: Small (5 min)
- Risk: None

### Option B: Inline fix
Change `middleware.ts:38` from `getCookie(c, 'session')` to `getCookie(c, 'ue_session')`.
- Effort: Small (1 min)
- Risk: The cookie name is still duplicated as a string literal in two files

## Technical Details
- Affected files: `apps/server/src/auth/middleware.ts`, `apps/server/src/routes/auth.ts`

## Acceptance Criteria
- [ ] Middleware and login endpoint use the same cookie name
- [ ] Cookie name defined in exactly one place
- [ ] Admin panel works end-to-end: login -> API calls succeed -> logout
