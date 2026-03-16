---
status: pending
priority: p3
issue_id: "011"
tags: [code-review, testing, phase2]
dependencies: ["001"]
---

# No tests for auth endpoints

## Problem Statement
Login, logout, and `/auth/me` have no tests. These are security-critical paths where regressions (e.g., accepting empty passwords, not revoking sessions) would go unnoticed.

## Proposed Solutions
Add tests covering:
- Successful login sets cookie and returns host info
- Wrong password returns 401
- Missing email/password returns 400
- Logout revokes session
- `/auth/me` with valid session returns host info
- `/auth/me` with expired/revoked session returns 401
- Effort: Medium (1-2 hours)

## Acceptance Criteria
- [ ] Auth happy path tested
- [ ] Auth error paths tested
- [ ] Session lifecycle (create, validate, revoke) tested end-to-end
