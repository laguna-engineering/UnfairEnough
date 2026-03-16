---
status: pending
priority: p3
issue_id: "008"
tags: [code-review, quality, phase2]
dependencies: []
---

# Dead refreshTenancyFlag re-export in auth.ts

## Problem Statement
`auth.ts:4,106` imports and re-exports `refreshTenancyFlag` from middleware. No file in the codebase imports it from auth.ts. Dead plumbing.

## Proposed Solutions
Remove the import and re-export. Future consumers can import directly from `auth/middleware.ts`.
- Effort: Small (2 min)

**Note:** Phase 1 review restored this export for forward compatibility. Verify no later phase imports from `routes/auth` before removing.

## Acceptance Criteria
- [ ] No unused re-exports in route files
