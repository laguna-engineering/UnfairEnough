---
status: pending
priority: p3
issue_id: "023"
tags: [code-review, quality, phase3]
dependencies: []
---

# Auto-reconnect on auth expiry has no retry limit

## Problem Statement
`App.tsx` onAuthExpired callback recursively calls `handleSelectAccount` after 1.5s. If the server keeps issuing codes that immediately expire (clock skew), this creates an infinite retry loop.

## Proposed Solutions
Add a retry counter (cap at 3). After exhaustion, show error message instead of retrying.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] Auth retry capped at 3 attempts
- [ ] User sees error message after retries exhausted
