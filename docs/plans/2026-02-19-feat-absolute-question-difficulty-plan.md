---
title: "feat: Add absolute difficulty level to questions"
type: feat
date: 2026-02-19
---

# Add Absolute Question Difficulty Level

## Overview

Add an intrinsic difficulty level (1-5) to every question, independent of any player. This enables:
- A mix of easy, medium, and hard questions in every game
- A scoring multiplier that blends objective question difficulty with each player's Elo-based tag competence
- Richer data for pool building and selection

## Problem Statement

Currently, question "difficulty" is entirely player-relative — either a hand-crafted per-player YAML override (`playerDifficulty`) or a dynamic Elo-derived value. There's no concept of "this question is objectively hard." This means:
- All questions are treated equally in pool building — no way to ensure a spread
- The score multiplier only reflects player competence, not question challenge
- Cold-start games (no Elo data) have no difficulty signal at all

## Proposed Solution

### New field: `difficulty` (INTEGER, 1-5, default 3)

| Level | Label   |
|-------|---------|
| 1     | Easy    |
| 2     | Below avg |
| 3     | Average |
| 4     | Above avg |
| 5     | Hard    |

- Questions without a `difficulty` value default to **3** (average)
- Optional in YAML — omitting it means "average"
- Validated as integer 1-5 on import

### Layered difficulty system

The three difficulty sources combine with this priority:

1. **Per-player YAML override** (highest priority) — if `playerDifficulty.Alice` exists, it wins
2. **Blended difficulty** — weighted average of absolute and Elo-based:
   `effectiveDifficulty = 0.5 * question.difficulty + 0.5 * eloDifficulty`
3. **Absolute difficulty alone** — used when no Elo data exists (cold start, no tags, anonymous player)

This preserves the existing `resolvePlayerDifficulty` chain while giving the absolute difficulty a meaningful role.

### Score multiplier

The existing `difficultyMultiplier()` function and its **0.95x-1.10x range stay unchanged**. The only change is what value gets fed into it:

| Scenario | Input to `difficultyMultiplier()` |
|----------|-----------------------------------|
| Has per-player YAML override | The override value (unchanged) |
| Has Elo data + absolute difficulty | `0.5 * absolute + 0.5 * eloDifficulty` |
| Has Elo data, no absolute difficulty | `0.5 * 3 + 0.5 * eloDifficulty` (3 is default) |
| No Elo data, has absolute difficulty | `question.difficulty` directly |
| No Elo data, no absolute difficulty | `3` (the new unified default) |

Examples:
- Hard question (5) + strong player (Elo=1): effective = 3.0, multiplier ~1.025x (neutral)
- Hard question (5) + weak player (Elo=5): effective = 5.0, multiplier = 1.10x (max reward)
- Easy question (1) + strong player (Elo=1): effective = 1.0, multiplier = 0.95x (min reward)
- Easy question (1) + weak player (Elo=5): effective = 3.0, multiplier ~1.025x (neutral)

### Pool building: soft difficulty spread

Extend the existing `selectDiverse()` function in `buildQuestionPool` to use difficulty as a secondary diversity factor alongside tags. When two candidate questions offer similar tag coverage, prefer the one whose difficulty level is underrepresented in the pool so far. No strict ratios — just a tiebreaker bias.

### Unify fallback difficulty to 3

Replace the existing **2.5** fallback values in `room.ts` (lines 791, 1013) and `GameController.ts` with **3**, aligning with the new "average" default. The 2.5 was an arbitrary compromise; 3 is semantically correct on a 1-5 scale.

## Technical Approach

### Phase 1: Schema & Types

**`packages/db/src/migrations.ts`** — Add MIGRATION_V5:
```sql
ALTER TABLE questions ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 3;
```

**`packages/db/src/schema.ts`**:
- Add `difficulty: number` to `QuestionRow` (line ~30)
- Add `difficulty: number` to `QuestionWithMeta` (line ~110)

**`packages/db/src/repositories/questions.ts`**:
- Map `difficulty` in `rowToQuestionWithMeta()`
- Include `difficulty` in `importQuestionSet()` INSERT

**`packages/db/src/import/validator.ts`**:
- Add optional `difficulty?: number` to `QuestionInput`
- Validate: must be integer 1-5 if present

**`packages/db/question-set.schema.json`**:
- Add `difficulty` property (integer, minimum 1, maximum 5)

**`packages/game-logic/src/utils/questionSelection.ts`**:
- Add optional `difficulty?: number` to `SelectableQuestion`

### Phase 2: Scoring Changes

**`packages/game-logic/src/utils/tagScoring.ts`**:

New function — `computeEffectiveDifficulty`:
```typescript
function computeEffectiveDifficulty(
  absoluteDifficulty: number,  // question.difficulty (1-5, default 3)
  eloDifficulty: number | null, // from computePlayerDifficulty, null if no data
): number {
  if (eloDifficulty == null) return absoluteDifficulty;
  return 0.5 * absoluteDifficulty + 0.5 * eloDifficulty;
}
```

Update `resolvePlayerDifficulty` signature:
```typescript
function resolvePlayerDifficulty(
  playerName: string,
  staticDifficulty: Record<string, number> | null,
  dynamicDifficulty: number, // now: computeEffectiveDifficulty output
): number
```
No logic change — just document that `dynamicDifficulty` now blends absolute + Elo.

### Phase 3: Game Orchestration

**`apps/server/src/room.ts`** — `computeRoundDifficulties()`:
- Read `question.difficulty` (default 3)
- Pass it through `computeEffectiveDifficulty(question.difficulty, eloDifficulty)` before feeding into `resolvePlayerDifficulty()`
- Replace 2.5 fallback with `question.difficulty ?? 3`

**`apps/tv-host/src/services/GameController.ts`** — same changes for local mode parity.

### Phase 4: Pool Building

**`packages/game-logic/src/utils/questionSelection.ts`** — `selectDiverse()`:
- Track difficulty level counts in the selected pool
- When scoring candidates, add a small bonus for questions whose difficulty level is underrepresented
- This extends the existing greedy tag-coverage algorithm without replacing it

### Phase 5: Protocol & Admin

**`packages/ws-protocol/src/messages.ts`**:
- Add `questionDifficulty?: number` to `RoundEndPayload` so clients can show "This was a Level 5 question!"

**`apps/server/admin/question-sets.html`**:
- Add `difficulty` to the schema reference table
- Add Difficulty column to the question table display

## Acceptance Criteria

- [x] New `difficulty` column in questions table (INTEGER, default 3, migration V5)
- [x] `QuestionWithMeta`, `QuestionRow`, `SelectableQuestion` types include `difficulty`
- [x] YAML import accepts optional `difficulty` (1-5 integer), defaults to 3
- [x] Validator rejects non-integer or out-of-range difficulty values
- [x] `computeEffectiveDifficulty()` blends absolute + Elo (50/50)
- [x] `resolvePlayerDifficulty` chain: per-player override > blended > absolute-only
- [x] Multiplier range stays 0.95x-1.10x
- [x] `buildQuestionPool` softly biases toward difficulty spread in diverse selection
- [x] Fallback difficulty unified to 3 (replacing all 2.5 occurrences)
- [x] Changes applied to both `room.ts` (hosted) and `GameController.ts` (local)
- [x] `questionDifficulty` added to `RoundEndPayload`
- [x] Admin dashboard shows difficulty in schema docs and question table
- [x] Tests cover: blended scoring, pool spread, edge cases (no tags, no Elo, YAML overrides)

## Dependencies & Risks

- **Dual orchestrator**: Every scoring/selection change must be applied to both `room.ts` and `GameController.ts`. Risk of divergence is the main maintenance concern.
- **Existing questions**: All 40 questions in `first.yml` will default to difficulty 3. The spread bias is a no-op until questions are authored with varied difficulty. This is acceptable — the feature degrades gracefully.
- **Migration**: `ALTER TABLE ADD COLUMN ... DEFAULT 3` is safe for SQLite — existing rows get the default value.

## References

- Current scoring: `packages/game-logic/src/utils/tagScoring.ts:77-81`
- Current selection: `packages/game-logic/src/utils/questionSelection.ts:159-240`
- Difficulty resolution: `packages/game-logic/src/utils/tagScoring.ts:86-100`
- Room orchestration: `apps/server/src/room.ts:783-810` (scoring), `1000-1016` (difficulty)
- Brainstorm: `docs/brainstorms/2026-02-07-unified-question-selection-brainstorm.md`
