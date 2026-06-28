---
status: pending
priority: p1
issue_id: "038"
tags: [code-review, security, phase5]
dependencies: []
---

# Session cookie name mismatch — admin cookie auth is broken

## Problem Statement
`auth.ts:11` defines `SESSION_COOKIE = 'ue_session'` and uses it everywhere (setCookie, getCookie, deleteCookie). But `middleware.ts:38` reads `getCookie(c, 'session')` — a different name. The scopedAuth middleware never finds the cookie set by login, so cookie-based admin auth silently fails on all protected `/api/*` routes.

## Proposed Solutions
In `apps/server/src/auth/middleware.ts` line 38, change `getCookie(c, 'session')` to `getCookie(c, 'ue_session')`, or import the `SESSION_COOKIE` constant from auth.ts.
- Effort: Small (5 min)

## Acceptance Criteria
- [ ] Middleware reads the same cookie name that login sets
- [ ] Admin dashboard works with cookie-based auth (no Bearer token needed)
