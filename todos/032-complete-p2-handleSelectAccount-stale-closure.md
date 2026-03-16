---
status: pending
priority: p2
issue_id: "032"
tags: [code-review, quality, phase4]
dependencies: []
---

# handleSelectAccount stale closure + unguarded timeout on cancel

## Problem Statement
`App.tsx:132-171`: `handleSelectAccount` references itself in a `setTimeout` inside `onAuthExpired`, but `useCallback` has empty deps `[]`. Two issues:

1. **No timeout cleanup** — If user presses Cancel during the 1.5s delay, `handleBack` runs but the timeout still fires, calling `handleSelectAccount()` and unexpectedly showing the login screen again.

2. **No retry limit** — If the server keeps expiring codes, this recurses indefinitely with 1.5s intervals, creating new WebSocket connections and HostedGameController instances each time.

## Proposed Solutions
1. Store the timeout ref and clear it in `handleBack`
2. Add a retry counter (max 3 retries) tracked via `useRef`
3. Add `handleSelectAccount` to the useCallback dependency array (or use a ref)
- Effort: Small (20 min)

## Acceptance Criteria
- [ ] Canceling during the retry delay does not re-trigger the auth flow
- [ ] Auth retries have a maximum limit (e.g., 3)
