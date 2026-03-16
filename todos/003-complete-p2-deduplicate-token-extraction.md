---
status: pending
priority: p2
issue_id: "003"
tags: [code-review, quality, phase2]
dependencies: ["001"]
---

# Duplicated token extraction in /auth/me

## Problem Statement
`/auth/me` reimplements token parsing inline (auth.ts:82-83) instead of using the shared `extractToken()` from middleware.ts. The inline version lacks the 128-byte length guard and the "don't fall through to cookie on malformed Authorization header" security rule.

## Findings
- `middleware.ts:31-40` — `extractToken()` with security guards
- `auth.ts:82-83` — inline version without guards, also uses the correct cookie name (masking bug #001)

## Proposed Solutions

### Option A: Export and reuse extractToken (recommended)
Export `extractToken()` from middleware.ts, import in auth.ts, use in `/auth/me`.
- Effort: Small (15 min)
- Risk: None

### Option B: Mount /auth/me behind scopedAuth
Move `/auth/me` to `/api/auth/me` so it goes through middleware automatically. Read `c.get('hostId')` instead of parsing tokens manually.
- Effort: Small (15 min)
- Risk: Changes the URL; need to update admin.js

## Acceptance Criteria
- [ ] Token extraction logic exists in exactly one place
- [ ] `/auth/me` has the same security guards as the middleware
