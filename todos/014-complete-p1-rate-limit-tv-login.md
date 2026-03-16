---
status: pending
priority: p1
issue_id: "014"
tags: [code-review, security, phase3]
dependencies: ["013"]
---

# No rate limiting on POST /auth/tv-login

## Problem Statement
The TV login endpoint has zero rate limiting. An attacker who observes a user code on a public TV screen can brute-force credentials. The admin login has rate limiting (from Phase 2 fixes) but tv-login does not.

## Proposed Solutions
Apply the same `isRateLimited` logic from the admin login. Also limit attempts per user code (3 failures invalidates the code).
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] `POST /auth/tv-login` has per-IP and per-email rate limiting
- [ ] Failed attempts per user code are capped (invalidate code after 3 failures)
- [ ] Returns 429 when rate limited
