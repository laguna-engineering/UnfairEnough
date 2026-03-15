---
status: pending
priority: p1
issue_id: "029"
tags: [code-review, quality, phase4]
dependencies: []
---

# returningConnecting state is dead — loading UI never visible

## Problem Statement
`connectFromSession` in `useGameState.ts:145-156` sets `returningConnecting = true`, then synchronously calls `wsClient.connect()` (non-blocking), then immediately sets `returningConnecting = false` and `phase = 'IDENTIFYING'`. React 18+ batches these updates, so:

1. `returningConnecting` is never visibly `true` — the "Connecting..." text in ReturningUserScreen never displays
2. The `isConnecting` prop on the Play button's `disabled` state is always `false`
3. The phase transitions to `IDENTIFYING` immediately, unmounting ReturningUserScreen before any feedback

## Proposed Solutions

### Option A: Remove dead state (simplest)
Remove `returningConnecting`, `setReturningConnecting`, and the `isConnecting` prop. Let the phase transition to `IDENTIFYING` drive the UI.
- Effort: Small (15 min)

### Option B: Make connecting state meaningful
Stay on `RETURNING` phase while connecting. Listen for `onConnectionStateChange` to transition to `IDENTIFYING` on success or show error on failure. Remove `setPhase('IDENTIFYING')` from `connectFromSession`.
- Effort: Medium (30 min)

## Acceptance Criteria
- [ ] No dead state variables that can never be observed
- [ ] User sees feedback during reconnection attempt (either a spinner or phase transition)
