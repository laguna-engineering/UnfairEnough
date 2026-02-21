# Time Bonus Fairness Brainstorm

**Date:** 2026-02-21
**Status:** Decided

## What We're Building

A fairer time bonus system that addresses two problems:
1. **Reading speed gap** — adults read faster than kids, giving them a systematic advantage on the time bonus (which is 90% of the max score)
2. **Snowball effect** — fast answerers build insurmountable leads even among equal players

## Why This Approach

**Chosen: Reduced time bonus + position-based dampening**

This extends the game's existing catch-up philosophy (which currently only lives in question selection) into the scoring formula itself. Two changes:

### Change 1: Reduce MAX_TIME_BONUS

From 900 → ~400. A correct answer becomes worth 100–500 instead of 100–1000. This passively compresses the reading speed advantage — the gap between a 2s and 8s answer drops from ~360 points to ~160 points.

### Change 2: Position-based time bonus multiplier

Apply a multiplier to the time bonus portion only (not the base 100 points):

- **Trailing players** (below average score) get a boosted time bonus (e.g., 1.3x)
- **Leading players** (above average score) get a dampened time bonus (e.g., 0.7x)
- **Middle players** get ~1.0x

Formula sketch:
```
positionRatio = (playerScore - minScore) / (maxScore - minScore)  // 0=last, 1=first
targetMultiplier = 1.3 - 0.6 * positionRatio                     // 1.3 for last, 0.7 for first
timeBonusMultiplier = 1.0 + catchUpInfluence * (targetMultiplier - 1.0)
```

The multiplier ramps with `catchUpInfluence` (same phase ramp as question selection), so round 1 is still fair and it kicks in gradually.

### Why not the alternatives?

- **Compressed curve only (sqrt):** Doesn't address the snowball — fast players still consistently earn more, they just earn a bit less more.
- **Per-player relative time bonus:** Cold start problem (first 2-3 rounds have no baseline), penalizes consistently fast players for being consistent, and is harder to reason about.
- **Explicit kid/adult labels:** User wants fully invisible solution, no setup step.

## Key Decisions

- Time bonus weight reduced from 90% to ~80% of max score (400 out of 500)
- Position-based dampening applied only to time bonus, not base points
- Reuses existing `catchUpInfluence` ramp for gradual activation
- No player demographic data needed — purely implicit from game state
- Trailing/leading defined by score relative to min/max (continuous, not binary)

## Open Questions

- Exact values for MAX_TIME_BONUS and dampening range (400/0.7-1.3) — may need playtesting
- Should the dampening also consider the difficulty multiplier, or stack independently?
- Edge case: all players tied → positionRatio is 0/0 → fall back to 1.0x multiplier
- Should the time bonus curve also be compressed (sqrt) on top of the position dampening, or is that overkill?
