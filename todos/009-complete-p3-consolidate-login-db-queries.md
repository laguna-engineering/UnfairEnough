---
status: pending
priority: p3
issue_id: "009"
tags: [code-review, performance, phase2]
dependencies: []
---

# Login does 2 DB queries when 1 would suffice

## Problem Statement
`auth.ts:27-33` calls `findByEmail(db, email)` then `getPasswordHash(db, email)` — two SELECTs on the same row. `findByEmail` already does `SELECT *` but strips the hash in the mapper.

## Proposed Solutions
Add `findByEmailWithHash(db, email)` to hostsRepo that returns `{ host: Host, passwordHash: string } | null` in a single query.
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Login uses a single DB query for email lookup + password hash
