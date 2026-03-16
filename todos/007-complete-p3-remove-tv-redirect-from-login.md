---
status: pending
priority: p3
issue_id: "007"
tags: [code-review, quality, phase2]
dependencies: []
---

# TV redirect flow in login.html is Phase 3 leakage

## Problem Statement
`login.html:98-110` checks `?redirect=tv` and shows "TV Approved!" — this is the device-flow TV login (Phase 3). Nothing in Phase 2 sets this parameter. 13 lines of YAGNI code.

## Proposed Solutions
Remove the `if (params.get('redirect') === 'tv')` block. Phase 3 can add it when TV login lands.
- Effort: Small (5 min)

## Acceptance Criteria
- [ ] Login success always redirects to `/admin/`
- [ ] No dead code for features that don't exist yet
