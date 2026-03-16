---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, quality, phase2]
dependencies: []
---

# checkAuth() health-check fallback is broken

## Problem Statement
`admin.js:167-172` — On 401 from `/auth/me`, fetches `/api/health` to check if tenancy is enabled. But `/api/health` is behind `scopedAuth` middleware, so it also returns 401 when tenancy is on. The health response has no tenancy field anyway, making the check a no-op that adds latency.

## Proposed Solutions

### Option A: Remove health check, redirect directly (recommended)
On 401 from `/auth/me`, redirect to login immediately. When tenancy is disabled, the middleware passes through with `hostId=null`, so `fetchJson()` never triggers 401 — the health check is unnecessary.
- Effort: Small (15 min)

### Option B: Add tenancy field to /api/health
Move `/api/health` outside middleware scope and add `tenancyEnabled` to the response. Client can check this field to decide whether to redirect.
- Effort: Small (30 min)

## Acceptance Criteria
- [ ] No unnecessary HTTP request on admin page load
- [ ] Auth check correctly redirects when tenancy is enabled and user is not logged in
- [ ] Admin panel still works without login when no accounts exist
