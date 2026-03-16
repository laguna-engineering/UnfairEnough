---
status: pending
priority: p3
issue_id: "027"
tags: [code-review, quality, phase3]
dependencies: []
---

# getCachedAuthState exported but never called

## Problem Statement
`AuthService.ts:51-53` exports `getCachedAuthState()` with zero call sites. YAGNI.

## Proposed Solutions
Delete the function. Add it back when a caller exists.
- Effort: Small (2 min)

## Acceptance Criteria
- [ ] No unused exports in AuthService.ts
