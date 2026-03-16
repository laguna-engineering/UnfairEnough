---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, security, phase2]
dependencies: []
---

# No rate limiting on login endpoint

## Problem Statement
`POST /auth/login` has no rate limiting. Argon2id is slow (~100-250ms) but an attacker can still attempt ~4-10 passwords/sec (~345K-864K/day). Also a CPU-based DoS vector — flooding the endpoint with login attempts consumes server CPU on expensive hashing.

## Proposed Solutions

### Option A: In-memory rate limiter (recommended)
Simple Map-based counter: max 5 failed attempts per email per 15 min, max 20 per IP per 15 min. Return 429 with Retry-After header. Reset on successful login.
- Effort: Medium (1-2 hours)
- Risk: Low — in-memory state lost on restart (acceptable for this use case)

### Option B: Hono rate-limiter middleware
Use a community Hono rate-limiting middleware package applied only to `/auth/login`.
- Effort: Small (30 min)
- Risk: Adds a dependency

## Acceptance Criteria
- [ ] Repeated failed logins for the same email are throttled
- [ ] Rapid requests from the same IP are throttled
- [ ] Returns 429 with Retry-After when limit exceeded
- [ ] Successful login resets the counter for that email
