---
title: Avoid Consecutive Same-Tag Questions
type: feat
date: 2026-02-22
---

# Avoid Consecutive Same-Tag Questions

## Overview

Make `selectNextQuestion` avoid selecting questions that share any tag with the previously selected question. This improves topic variety round-to-round. Two exceptions: (1) all remaining candidates overlap → fall back to full pool, (2) the question set is thematic (only one unique tag across all questions) → skip the check entirely.

## Problem Statement

In casual mode, `selectNextQuestion` can select two consecutive questions on the same topic (e.g. two "gaming" questions back-to-back). This feels repetitive and reduces the perceived variety of the quiz, especially with smaller pools.

## Proposed Solution

### 1. Add `isThematicSet` utility (`questionSelection.ts`)

```typescript
/** True when every question in the set shares a single tag universe (only 1 unique tag). */
export function isThematicSet(questions: SelectableQuestion[]): boolean {
  const allTags = new Set(questions.flatMap((q) => q.tags.map((t) => t.toLowerCase().trim())));
  return allTags.size <= 1;
}
```

Computed once at game start by callers. Cheap O(n) scan.

### 2. Extend `RoundSelectionContext` (`questionSelection.ts:168`)

Add two optional fields (backward compatible):

```typescript
export interface RoundSelectionContext {
  players: RoundSelectionPlayer[];
  playerTagScores: Map<string, Map<string, number>>;
  roundIndex?: number;
  totalRounds?: number;
  previousQuestionTags?: string[];  // NEW — tags of the last served question
  isThematic?: boolean;             // NEW — skip tag-avoidance for single-tag sets
}
```

### 3. Modify `selectNextQuestion` (`questionSelection.ts:188`)

Insert a filtering step **after** the trivial guard (`remainingPool.length <= 1`) and **before** any scoring logic. The filtered pool replaces `remainingPool` for the rest of the function:

```typescript
// ── Tag-avoidance filter ──────────────────────────────────
const { previousQuestionTags, isThematic } = context;
let pool = remainingPool;

if (!isThematic && previousQuestionTags && previousQuestionTags.length > 0) {
  const prevTags = new Set(previousQuestionTags.map((t) => t.toLowerCase().trim()));
  const filtered = remainingPool.filter(
    (q) => !q.tags.some((t) => prevTags.has(t.toLowerCase().trim())),
  );
  if (filtered.length > 0) {
    pool = filtered;
  }
  // else: all candidates overlap → keep full remainingPool (fallback)
}
```

Then use `pool` instead of `remainingPool` throughout the rest of the function (the random picks and the scoring loop).

**Important**: the `pool.length <= 1` trivial guard at the very top stays as-is using `remainingPool` (it covers the "single question left" case). A second check `if (pool.length === 1) return pool[0]` after filtering handles the case where filtering leaves exactly one candidate.

### 4. Update callers

**`apps/server/src/room.ts` — `selectQuestionForRound` (~line 1094)**

Pass previous question tags from `this.activeQuestion`:

```typescript
return selectNextQuestion(remaining, {
  players,
  playerTagScores: this.playerTagScores,
  roundIndex: this.currentQuestionIndex,
  totalRounds: this.totalQuestionCount,
  previousQuestionTags: this.activeQuestion?.tags,
  isThematic: this.isThematicSet,
});
```

Compute `this.isThematicSet` once during game setup (where `questionPool` or `questions` is populated). Add a private field:

```typescript
private isThematicSet = false;
```

Set it after pool building:

```typescript
this.isThematicSet = isThematicSet(this.questionPool);
// (or this.questions for configured+meta sets)
```

**`apps/tv-host/src/services/GameController.ts` — `showNextQuestion` (~line 304)**

Same pattern — pass `this.activeQuestion?.tags` and pre-compute `this.isThematicSet`.

### 5. Export `isThematicSet` from game-logic package

Add to the existing exports in `questionSelection.ts` (it's already a named export by virtue of the `export function` syntax).

## Acceptance Criteria

- [x] Two consecutive questions never share a tag (when alternatives exist)
- [x] If all remaining questions share a tag with the previous one, selection proceeds normally (fallback)
- [x] Thematic sets (single unique tag) skip the filter entirely — no performance waste
- [x] `previousQuestionTags` is optional — omitting it preserves current behavior (backward compatible)
- [x] `isThematic` is optional — defaults to false (filter is active)
- [x] Both callers (room.ts, GameController.ts) pass the new context fields
- [x] All existing tests still pass (no behavioral regression for cases without `previousQuestionTags`)

## Test Plan

New tests in `questionSelection.test.ts`:

### `selectNextQuestion` — tag avoidance

1. **Avoids same-tag question**: Pool has 3 questions (A: `["gaming"]`, B: `["science"]`, C: `["gaming", "history"]`). Previous tags = `["gaming"]`. Over 100 runs, B is always selected (only candidate with no gaming overlap). A and C are never picked.

2. **Fallback when all overlap**: Pool has 2 questions, both tagged `["gaming"]`. Previous tags = `["gaming"]`. Both questions still get selected (fallback to full pool).

3. **Thematic set skips filter**: Pool has 3 questions all tagged `["geography"]`. `isThematic = true`, previous tags = `["geography"]`. All 3 questions are still candidates (filter not applied).

4. **No previousQuestionTags → no filtering**: Same pool as test 1 but without `previousQuestionTags`. All 3 questions get selected over multiple runs.

5. **Multi-tag overlap**: Previous tags = `["gaming", "history"]`. Pool has Q1: `["science"]`, Q2: `["history", "art"]`, Q3: `["gaming"]`. Only Q1 should be selected (Q2 overlaps on "history", Q3 overlaps on "gaming").

6. **Catch-up scoring still works after filtering**: Trailing player good at "science", previous question was "gaming". Pool has "science" and "history" questions. Over 200 runs, "science" question is preferred (catch-up still biases after filter removes "gaming" candidates).

### `isThematicSet`

7. **Single tag**: All questions tagged `["geography"]` → returns `true`.
8. **Multiple tags**: Questions tagged `["geography"]`, `["history"]` → returns `false`.
9. **Empty tags**: Question with no tags → returns `true` (0 unique tags ≤ 1).
10. **Multi-tag questions with shared tag**: All questions have `["trivia", "X"]` with varying X → returns `false` (multiple unique tags).

## Files Changed

| File | Change |
|------|--------|
| `packages/game-logic/src/utils/questionSelection.ts` | Add `isThematicSet`, extend `RoundSelectionContext`, modify `selectNextQuestion` |
| `packages/game-logic/src/__tests__/questionSelection.test.ts` | Add ~10 new tests |
| `apps/server/src/room.ts` | Pass `previousQuestionTags` and `isThematic` to `selectNextQuestion` |
| `apps/tv-host/src/services/GameController.ts` | Same caller update |

## References

- `selectNextQuestion`: `packages/game-logic/src/utils/questionSelection.ts:188`
- `RoundSelectionContext`: `packages/game-logic/src/utils/questionSelection.ts:168`
- Server caller: `apps/server/src/room.ts:1094`
- TV caller: `apps/tv-host/src/services/GameController.ts:304`
- Existing tests: `packages/game-logic/src/__tests__/questionSelection.test.ts`
