---
title: Time Bonus Fairness
type: feat
date: 2026-02-21
---

# Time Bonus Fairness

## Overview

Reduce the time bonus weight and add position-based dampening so that reading speed (adults vs kids) and snowball effects have less impact on game outcomes. This extends the existing catch-up philosophy — currently only in question selection — into the scoring formula itself.

## Problem Statement

The time bonus is 900 out of 1000 possible points per question (90%). A player answering in 2s vs 8s on a 15s timer scores ~810 vs ~420 — nearly 2x. Adults read faster than kids, creating a systematic advantage. Additionally, fast answerers snowball leads even among equal players, making the game feel decided early.

## Proposed Solution

Two changes to the scoring pipeline:

1. **Reduce `MAX_TIME_BONUS`** from 900 → 400 (correct answer worth 100–500 instead of 100–1000)
2. **Position-based time bonus multiplier** — trailing players get a boosted time bonus (up to 1.3x), leading players get a dampened one (down to 0.7x), ramping with `catchUpInfluence`

### Scoring Pipeline (Before → After)

**Before:**
```
baseScore = 100 + floor(900 * timeRatio)
pointsEarned = round(baseScore * difficultyMultiplier)
```

**After:**
```
timeBonus = floor(400 * timeRatio)
adjustedTimeBonus = timeBonus * timeBonusMultiplier
adjustedScore = 100 + adjustedTimeBonus
pointsEarned = round(adjustedScore * difficultyMultiplier)
```

Where `timeBonusMultiplier` is:
```
positionRatio = (playerScore - minScore) / (maxScore - minScore)   // 0=last, 1=first
targetMultiplier = 1.3 - 0.6 * positionRatio                      // 1.3 for last, 0.7 for first
timeBonusMultiplier = 1.0 + catchUpInfluence * (targetMultiplier - 1.0)
```

### Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| `MAX_TIME_BONUS` value | Exactly 400 | Max score per question = 500, clean number |
| Multiplier stacking | Difficulty multiplier applies to full adjusted score | Matches current pattern; keeps difficulty relevant |
| Score snapshot | Pre-round scores (before any current-round points) | Prevents iteration-order dependency |
| `calculateScore()` refactor | Return `{ basePoints, timeBonus }` | Clean split, enables time-only multiplier |
| Division-by-zero guard | `positionRatio = 0.5` when `maxScore === minScore` | Produces neutral 1.0x multiplier |
| Visibility | Time bonus multiplier is NOT shown to players | Avoids "punishment" UX for leaders |
| `PlayerResult` protocol | Add `timeBonusMultiplier` field | Transparency for debugging, future UI |
| `catchUpInfluence` in configured mode | Same ramp as casual mode | Simplicity; playtest to validate |
| Rounding | Float through intermediates, `Math.round()` once at `pointsEarned` | Avoids compounding 1-point errors |

## Technical Approach

### Phase 1: Extract and refactor shared utilities

**`packages/game-logic/src/utils/scoring.ts`**

- Change `calculateScore()` return type from `number` to `{ basePoints: number; timeBonus: number }`
- Reduce `MAX_TIME_BONUS` from 900 to 400
- Export `MAX_TIME_BONUS` and `BASE_POINTS` for use in tests
- Add new function `computeTimeBonusMultiplier()`:

```typescript
export function computeTimeBonusMultiplier(
  playerScore: number,
  allScores: number[],
  roundIndex?: number,
  totalRounds?: number,
): number {
  if (allScores.length <= 1) return 1;
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const positionRatio = maxScore === minScore ? 0.5 : (playerScore - minScore) / (maxScore - minScore);
  const targetMultiplier = 1.3 - 0.6 * positionRatio;
  const catchUpInfluence = computeCatchUpInfluence(roundIndex, totalRounds);
  return 1.0 + catchUpInfluence * (targetMultiplier - 1.0);
}
```

- Extract `computeCatchUpInfluence()` from `questionSelection.ts` into a shared location (either `scoring.ts` or a new `catchUp.ts`):

```typescript
export function computeCatchUpInfluence(
  roundIndex?: number,
  totalRounds?: number,
): number {
  if (roundIndex === undefined || totalRounds === undefined || totalRounds <= 0) return 1;
  return Math.min(1, Math.max(0, roundIndex / (totalRounds * 0.75)));
}
```

- Update `selectNextQuestion()` in `questionSelection.ts` to import and use the extracted `computeCatchUpInfluence()`.

### Phase 2: Update server scoring (`room.ts`)

In `showRoundResults()` (line ~852):

1. **Snapshot scores before the loop:**
   ```typescript
   const preRoundScores = [...this.players.values()].map(p => p.score);
   ```

2. **In the scoring loop**, after computing `baseScore` via `calculateScore()`:
   ```typescript
   const { basePoints, timeBonus } = calculateScore(isCorrect, responseTimeMs, timeLimit);
   const tbMultiplier = computeTimeBonusMultiplier(
     player.score, preRoundScores, this.currentRoundIndex, this.totalRounds
   );
   const adjustedScore = basePoints + timeBonus * tbMultiplier;
   const pointsEarned = Math.round(adjustedScore * diffMultiplier);
   ```

3. **Add `timeBonusMultiplier` to `playerResults`:**
   ```typescript
   playerResults.push({
     ...existing fields,
     baseScore: basePoints + timeBonus, // pre-multiplier raw score for consistency
     timeBonusMultiplier: tbMultiplier,
   });
   ```

4. **Ensure `this.currentRoundIndex` and `this.totalRounds` are accessible** — check if they already exist on the Room class or need to be tracked.

### Phase 3: Update local TV scoring (`GameController.ts`)

Mirror the exact same changes from Phase 2 in `apps/tv-host/src/services/GameController.ts` `showRoundResults()` (~line 476). The local mode must produce identical scores.

### Phase 4: Update wire protocol

**`packages/ws-protocol/src/messages.ts`**

Add to `PlayerResult`:
```typescript
timeBonusMultiplier?: number;
```

Optional field for backward compatibility with any existing clients.

### Phase 5: Tests

Create `packages/game-logic/src/__tests__/scoring.test.ts`:

- **`calculateScore()` tests:**
  - Wrong answer → `{ basePoints: 0, timeBonus: 0 }` (or just 0)
  - Instant correct → `{ basePoints: 100, timeBonus: 400 }`
  - Half-time correct → `{ basePoints: 100, timeBonus: 200 }`
  - At-limit correct → `{ basePoints: 100, timeBonus: 0 }`

- **`computeTimeBonusMultiplier()` tests:**
  - All tied → returns 1.0
  - Single player → returns 1.0
  - Last place, full catchUp → returns 1.3
  - First place, full catchUp → returns 0.7
  - Middle of pack → returns ~1.0
  - `catchUpInfluence = 0` (round 1) → always 1.0 regardless of position
  - `catchUpInfluence = 0.5` → returns blended value

- **`computeCatchUpInfluence()` tests:**
  - `roundIndex=0` → 0
  - `roundIndex = totalRounds * 0.75` → 1.0
  - `roundIndex > totalRounds * 0.75` → capped at 1.0
  - Undefined params → 1 (backward compat)

- **Integration test:** Simulate a 5-round game, verify trailing player accumulates bonus over rounds.

### Phase 6: UI (minimal, optional)

The time bonus multiplier is intentionally **not shown** to players. No UI changes needed for MVP. The `pointsEarned` value already reflects all multipliers, so existing displays remain correct.

If desired later, the `timeBonusMultiplier` field on `PlayerResult` is available for a future "catch-up boost" badge similar to the existing difficulty bonus badge.

## Acceptance Criteria

- [x] `MAX_TIME_BONUS` is 400 (max raw score per question = 500)
- [x] `calculateScore()` returns `{ basePoints, timeBonus }` with all callers updated
- [x] `computeTimeBonusMultiplier()` returns 1.0 when all scores are tied or single player
- [x] `computeTimeBonusMultiplier()` returns 1.3 for last place, 0.7 for first place at full catch-up
- [x] `computeTimeBonusMultiplier()` returns 1.0 for everyone on round 1 (`catchUpInfluence = 0`)
- [x] `computeCatchUpInfluence()` extracted and shared between question selection and scoring
- [x] Position ratios computed from pre-round score snapshot (no iteration-order dependency)
- [x] Both `room.ts` and `GameController.ts` updated identically
- [x] `timeBonusMultiplier` added to `PlayerResult` in ws-protocol
- [x] All new functions have unit tests in `scoring.test.ts`
- [x] Existing `questionSelection.test.ts` still passes after `catchUpInfluence` extraction
- [x] `yarn lint` passes

## Dependencies & Risks

- **Dual implementation sync:** `room.ts` and `GameController.ts` must match exactly. Risk mitigated by pure functions in `game-logic` — both callers import the same functions.
- **Score magnitude shift:** Total game scores drop ~50% (max 500/round vs 1000). No known hardcoded score thresholds exist, but leaderboard aesthetics may feel different.
- **Playtesting needed:** The 0.7–1.3 range and MAX_TIME_BONUS=400 are educated guesses. Values may need tuning after real gameplay sessions, especially for 2-player games where the dampening ratio is most extreme.

## References

- Brainstorm: `docs/brainstorms/2026-02-21-time-bonus-fairness-brainstorm.md`
- Scoring formula: `packages/game-logic/src/utils/scoring.ts:1-24`
- Server scoring loop: `apps/server/src/room.ts:852-885`
- Local TV scoring loop: `apps/tv-host/src/services/GameController.ts:476-514`
- Catch-up ramp: `packages/game-logic/src/utils/questionSelection.ts:197-202`
- Protocol types: `packages/ws-protocol/src/messages.ts:101-121`
- Difficulty multiplier tests (pattern to follow): `packages/game-logic/src/__tests__/tagScoring.test.ts:197-218`
