---
status: pending
priority: p3
issue_id: "036"
tags: [code-review, quality, phase4]
dependencies: []
---

# Dead export: getCachedGuestSession never called

## Problem Statement
`authStorage.ts:53` exports `getCachedGuestSession()` with zero call sites. YAGNI.

## Proposed Solutions
Delete the function. Add it back when a caller exists.
- Effort: Small (2 min)

## Acceptance Criteria
- [ ] No unused exports in authStorage.ts
