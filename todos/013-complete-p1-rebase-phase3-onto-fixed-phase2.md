---
status: pending
priority: p1
issue_id: "013"
tags: [code-review, phase3]
dependencies: []
---

# Rebase Phase 3 onto fixed Phase 2

## Problem Statement
Phase 3 (`8ec3af6`) is based on Phase 2 before review fixes (`341bbd4`). Merging reintroduces all Phase 2 bugs: cookie name mismatch, no rate limiting, no resource ownership, duplicate token extraction, missing security headers.

## Proposed Solutions
Rebase `feat/account-system-phase3` onto the updated `feat/account-system-phase2` (`191acbc`). Resolve conflicts in `auth.ts`, `middleware.ts`, `index.ts`. Verify all Phase 2 fixes survive.
- Effort: Medium (30-60 min, conflict resolution)

## Acceptance Criteria
- [ ] Phase 3 branch is based on fixed Phase 2 commit
- [ ] `SESSION_COOKIE` imported from shared constant
- [ ] `extractToken` exported and reused
- [ ] Rate limiting on `POST /auth/login` preserved
- [ ] Resource ownership checks preserved
- [ ] Security headers on admin pages preserved
