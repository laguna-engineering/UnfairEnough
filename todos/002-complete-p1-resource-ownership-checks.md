---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, security, phase2]
dependencies: []
---

# Missing resource ownership checks (IDOR vulnerability)

## Problem Statement
All single-resource endpoints (GET/PUT/DELETE by ID) fetch by primary key without verifying the resource belongs to the authenticated host. In multi-tenant mode, Host A can access Host B's data by knowing UUIDs.

## Findings
12 affected endpoints across 4 route files:

**players.ts:**
- `PUT /:id` (line 55) — `getPlayer(db, id)` no host check
- `PUT /:id/unbind` (line 95) — same
- `DELETE /:id` (line 107) — `deleteProfile(db, id)` no host check
- `GET /:id/stats` (line 118) — unscoped
- `PUT /:id/tags` (line 173) — unscoped
- `DELETE /:id/tags/:tag` (line 196) — unscoped

**games.ts:**
- `GET /:id` (line 17) — `getGame(db, id)` no host check

**questionSets.ts:**
- `GET /:id` (line 19) — unscoped
- `DELETE /:id` (line 92) — `softDeleteQuestionSet(db, id)` unscoped

**metaSets.ts:**
- `GET /:id` (line 9) — unscoped
- `PUT /:id` (line 77) — unscoped
- `DELETE /:id` (line 132) — unscoped

## Proposed Solutions

### Option A: Repository-level scoping (recommended)
Add `hostId` parameter to `getPlayer`, `getGame`, `getQuestionSet`, `softDeleteQuestionSet`, `deleteProfile`, etc. Filter by `host_id` in the WHERE clause. Return null/false on mismatch (appears as 404 to the client, prevents enumeration).
- Effort: Medium (2-3 hours)
- Risk: Low — changes are additive

### Option B: Route-level guard
After fetching the resource, check `if (hostId !== null && resource.hostId !== hostId) return 404`. Requires adding `hostId` to domain types that don't expose it yet (e.g., `PlayerProfile`, `GameSession`).
- Effort: Medium (2 hours)
- Risk: Easy to forget on new routes

## Technical Details
- Affected repos: `players.ts`, `games.ts`, `questions.ts` in `packages/db/src/repositories/`
- Affected routes: `players.ts`, `games.ts`, `questionSets.ts`, `metaSets.ts` in `apps/server/src/routes/`

## Acceptance Criteria
- [ ] Every `/:id` endpoint verifies resource belongs to authenticated host
- [ ] Returns 404 (not 403) on ownership mismatch
- [ ] When `hostId` is null (no tenancy), all resources are accessible (backward compat)
