---
status: pending
priority: p2
issue_id: "004"
tags: [code-review, architecture, phase2]
dependencies: []
---

# Raw SQL in questions route bypasses repository pattern

## Problem Statement
`GET /api/questions/stats` (questions.ts:28-55) builds SQL with inline host scoping instead of using `hostScope()` from the db package. It's the only route that constructs SQL directly, breaking the repository pattern. The `else` branch has suspect logic: `AND (qs.host_id IS NULL OR qs.id IS NULL)` conflates "no host" with "no question set".

## Proposed Solutions

### Option A: Move to questionsRepo (recommended)
Create `questionsRepo.getQuestionStats(db, hostId)` using `hostScope()`. Route handler just calls the repo function.
- Effort: Small (30 min)
- Risk: None

## Acceptance Criteria
- [ ] Stats query lives in `packages/db/src/repositories/questions.ts`
- [ ] Uses `hostScope()` helper for host scoping
- [ ] Route handler has no raw SQL
