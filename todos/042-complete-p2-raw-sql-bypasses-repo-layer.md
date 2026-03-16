---
status: pending
priority: p2
issue_id: "042"
tags: [code-review, architecture, phase5]
dependencies: []
---

# Raw SQL in auth.ts bypasses sessionsRepo — duplicate device lookup

## Problem Statement
`auth.ts` lines 84-87 and 132-135 query `sessions` directly with raw SQL to get `device_id`, then call `playersRepo.findByDeviceId`. This duplicates the "session -> device -> player" pattern twice and bypasses the repo layer.

Root cause: `sessionsRepo.validate()` returns `{ hostId, type }` but discards `deviceId`. The callers re-query to get it.

## Proposed Solutions
1. Extend `sessionsRepo.validate()` return type to include `deviceId: string | null`
2. Remove both raw SQL queries in auth.ts
3. Extract a `getGuestPlayer(db, session)` helper for the shared pattern
- Effort: Small (20 min)

## Acceptance Criteria
- [ ] No raw SQL in auth.ts
- [ ] sessionsRepo.validate returns deviceId
- [ ] Device-to-player lookup is not duplicated
