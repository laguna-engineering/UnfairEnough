---
title: "feat: Unified Question Selection Engine"
type: feat
date: 2026-02-07
---

# Unified Question Selection Engine

## Overview

Unify question selection logic so both hosted (Bun server) and local (TV-as-server) modes use identical algorithms from `packages/game-logic/`. Two new pure functions — `buildQuestionPool` and an enhanced `selectNextQuestion` — replace the current divergent codepaths. The local `GameController` gains dynamic selection, tag scoring, and difficulty multipliers, closing the feature parity gap with the hosted server.

## Problem Statement / Motivation

Today the hosted server (`apps/server/src/room.ts`) has a sophisticated question selection pipeline: 3x pool loading, per-round catch-up selection via `selectNextQuestion`, tag-based difficulty multipliers, and in-game tag score updates. The local `GameController` (`apps/tv-host/src/services/GameController.ts`) has **none of this** — it loads the exact question count and iterates sequentially with raw scoring.

This means:
- Local games feel "dumber" — no catch-up, no adaptive difficulty.
- Two divergent codepaths to maintain for the same game.
- The selection logic in `room.ts` is tightly coupled to the server runtime.

The fix: extract all question selection into `packages/game-logic/` as pure functions, then have both modes call them.

## Proposed Solution

### Two Pure Functions in `packages/game-logic/`

**1. `buildQuestionPool`** — Called once at game start. Curates a pool from all available questions.

```typescript
// packages/game-logic/src/utils/questionSelection.ts

interface PoolBuildContext {
  nRounds: number;
  playerTagScores?: Map<string, Map<string, number>>; // profileId -> tag -> score
}

interface SelectableQuestion {
  id: string;
  tags: string[];
  playerDifficulty?: Record<string, number> | null;
}

function buildQuestionPool<T extends SelectableQuestion>(
  allQuestions: T[],
  context: PoolBuildContext,
  random?: () => number,
): T[];
```

Behavior:
- **With tag scores**: Half the pool targets collective player strengths (questions whose tags match tags where players have high scores); the other half is a diverse mix. If fewer than 50% of players have profiles, shift proportionally toward the diversity fallback.
- **Without tag scores (cold start)**: Balanced tag diversity — greedily select to maximize distinct tags represented.
- **Target pool size**: ~3x `nRounds`, capped at `allQuestions.length`. If `allQuestions.length < nRounds`, return all available (caller handles early game end).
- Returns the curated pool (a subset of `allQuestions` in no particular order).

**2. Enhanced `selectNextQuestion`** — Called each round during the leaderboard screen.

```typescript
// packages/game-logic/src/utils/questionSelection.ts

interface RoundSelectionContext {
  players: RoundSelectionPlayer[];
  playerTagScores: Map<string, Map<string, number>>;
  roundIndex: number;
  totalRounds: number;
}

function selectNextQuestion<T extends SelectableQuestion>(
  remainingPool: T[],
  context: RoundSelectionContext,
  random?: () => number,
): T;
```

Behavior:
- **Phase ramp**: `catchUpInfluence = clamp(roundIndex / (totalRounds * 0.75), 0, 1)`. At round 0 → 0% catch-up (fully random). At 75% through the game → 100% catch-up. The existing 70/30 trailing-easiness/leading-hardness split is scaled by this influence factor.
- Blending: `score = catchUpInfluence * catchUpScore + (1 - catchUpInfluence) * randomScore` where `randomScore` is a uniform random value.
- **Tag scores optional**: If `playerTagScores` is empty, catch-up uses only in-game score gaps (all players get default 2.5 difficulty → catch-up score differences come from the "trailing gets easier" logic using score-based trailing/leading classification).
- **Edge cases**: Pool ≤1 → return the only question. All tied → random. 1 player → random (no catch-up possible).
- **Injectable randomness** via optional `random` parameter (defaults to `Math.random`). Enables deterministic testing.

### Configured Mode Policy

Configured mode **bypasses both functions** and continues to serve questions in authored order (DB rowid). Difficulty multipliers still apply. This preserves author intent for hand-crafted question sequences.

### Minimal Interface Pattern

Both functions accept a generic `T extends SelectableQuestion` rather than the full `QuestionWithMeta`. This:
- Decouples `game-logic` from the DB schema (only needs `id`, `tags`, `playerDifficulty`).
- Lets the local controller pass `QuestionWithMeta` directly (it's a superset).
- Lets tests pass minimal stubs.

## Technical Approach

### Phase 1: Core Functions in `game-logic`

**Files to modify:**
- `packages/game-logic/src/utils/questionSelection.ts` — Add `buildQuestionPool`, refactor `selectNextQuestion` to accept phase ramp and injectable randomness.
- `packages/game-logic/src/utils/questionSelection.ts` — Add `SelectableQuestion` interface.
- `packages/game-logic/src/index.ts` — Export new types and functions.
- `packages/game-logic/src/__tests__/questionSelection.test.ts` — Add tests for `buildQuestionPool`, update existing tests for new signature.

**Changes to `selectNextQuestion`:**
- Add `roundIndex` and `totalRounds` to `RoundSelectionContext`.
- Add optional `random` parameter.
- Implement phase ramp: `catchUpInfluence = clamp(roundIndex / (totalRounds * 0.75), 0, 1)`.
- Replace `Math.random()` calls with `random()` parameter.
- Keep backward compatibility: `roundIndex` defaults to `totalRounds` (full catch-up) if not provided, preserving existing server behavior until the server is updated.

**`buildQuestionPool` algorithm:**
1. If `allQuestions.length <= nRounds`: return all questions (pool too small to curate).
2. Target pool size = `min(nRounds * 3, allQuestions.length)`.
3. If tag scores available and ≥50% of player entries have data:
   - Compute each question's "strength score" = average decayed tag score across all profiled players for that question's tags.
   - Sort by strength score descending. Take top `targetSize / 2` as "strength" bucket.
   - From remaining, select `targetSize / 2` maximizing tag diversity (greedy distinct-tag coverage).
4. If no tag scores (or <50% profiled): select `targetSize` questions maximizing tag diversity.
5. Shuffle the final pool (selection order is the per-round picker's job).

### Phase 2: Integrate into Server (`room.ts`)

**Files to modify:**
- `apps/server/src/room.ts` — Replace inline pool logic with `buildQuestionPool`, pass phase params to `selectNextQuestion`.

**Changes:**
- In `startGame()` (line ~336): Replace `getRandomQuestions(db, requestedCount * 3)` → `getRandomQuestions(db, allAvailableCount)` then `buildQuestionPool(allQuestions, { nRounds, playerTagScores })`.
- In `selectQuestionForRound()` (line ~729): Add `roundIndex: this.currentQuestionIndex` and `totalRounds: this.totalQuestionCount` to the context.
- Fix the `handleAnswer` bug (line ~479): Use `getCurrentQuestion()` instead of `this.questions[this.currentQuestionIndex]` to validate the question ID in casual mode.

### Phase 3: Integrate into Local `GameController`

**Files to modify:**
- `apps/tv-host/src/services/GameController.ts` — Major refactor to add pool-based selection, tag scoring, difficulty multipliers.
- `apps/tv-host/src/services/WebSocketServer.ts` — Parse and surface `deviceId` from JOIN messages.

**Changes to `GameController`:**

1. **Store `QuestionWithMeta[]` instead of `QuestionWithAnswer[]`:**
   - Change `private questions: QuestionWithAnswer[]` → `private questionPool: QuestionWithMeta[]`.
   - Add `private usedQuestionIds = new Set<string>()`.
   - Remove the `loadQuestions()` method that strips metadata. Load `QuestionWithMeta[]` directly.
   - Derive the wire-format `Question` at broadcast time (matching how `room.ts` does it at line ~444).

2. **Add tag score support:**
   - Add `private playerTagScores = new Map<string, Map<string, number>>()`.
   - Add `private currentRoundDifficulties = new Map<string, number>()`.
   - In `startGame()`: attempt to load tag scores from local DB (if player profiles are available). If players have no profiles, proceed with empty map (cold start).
   - In `showRoundResults()`: call `computeTagUpdates()` per player, update in-memory tag scores and persist to local DB.

3. **Use `buildQuestionPool` at game start:**
   - In casual mode: load 3x questions from DB, then `buildQuestionPool(dbQuestions, { nRounds, playerTagScores })`.
   - In configured mode: load by set, skip pool building.

4. **Use `selectNextQuestion` per round:**
   - In `showNextQuestion()`: filter pool by `usedQuestionIds`, call `selectNextQuestion(remaining, context)`.
   - Track `usedQuestionIds` after each question.

5. **Apply difficulty multiplier:**
   - In `showRoundResults()`: call `computePlayerDifficulty()` and `difficultyMultiplier()` to compute per-player scores, matching the server's logic.
   - Populate `baseScore`, `difficultyMultiplier`, and `difficulty` fields in `PlayerResult`.

6. **Broadcast tags in ROUND_END:**
   - Add `tags: question.tags.length > 0 ? question.tags : undefined` to the ROUND_END payload (matching server behavior at room.ts line ~589).

**Changes to `WebSocketServer`:**
- In the JOIN message handler (line ~257): parse `deviceId` from the message payload.
- Add `deviceId?: string` to the `PlayerJoinedCallback` interface.
- Surface `deviceId` to `GameController` so it can look up player profiles.

### Phase 4: Player Profile Resolution in Local Mode

**Files to modify:**
- `apps/tv-host/src/services/GameController.ts` — Add profile lookup.

**Changes:**
- When a player joins with `deviceId`, call `playersRepo.findByDeviceId(db, deviceId)` to resolve their `profileId`.
- Store `profileId` on the in-memory player object.
- If no profile found (anonymous player), proceed without tag data for that player.
- **Optional network fetch** (stretch goal): If the TV app has network access, attempt to fetch tag scores from the hosted server's API for profiled players. On failure, proceed with local DB data or cold start.

## Acceptance Criteria

### Functional Requirements

- [x] `buildQuestionPool` produces a curated pool from available questions
- [x] `buildQuestionPool` balances tags when no player tag scores are available
- [x] `buildQuestionPool` targets player strengths when tag scores are provided
- [x] `buildQuestionPool` gracefully handles pools smaller than `nRounds`
- [x] `selectNextQuestion` applies phase ramp (random early, catch-up late)
- [x] `selectNextQuestion` works with empty `playerTagScores` (cold start)
- [x] Server (`room.ts`) uses `buildQuestionPool` in casual mode
- [x] Server passes `roundIndex`/`totalRounds` to `selectNextQuestion`
- [x] Local `GameController` uses `buildQuestionPool` in casual mode
- [x] Local `GameController` uses `selectNextQuestion` per round
- [x] Local `GameController` applies difficulty multipliers to scoring
- [x] Local `GameController` updates tag scores after each round
- [x] Local `GameController` broadcasts `tags` in ROUND_END
- [x] Local `WebSocketServer` parses and surfaces `deviceId` from JOIN
- [x] Configured mode in both modes continues to serve authored order
- [x] `handleAnswer` bug in `room.ts` fixed (use `getCurrentQuestion()`)

### Quality Gates

- [x] Unit tests for `buildQuestionPool` (cold start, with tags, small pool, empty input)
- [x] Unit tests for enhanced `selectNextQuestion` (phase ramp, all tied, single player, cold start)
- [x] Deterministic tests using injectable `random` parameter
- [x] Existing `questionSelection.test.ts` tests still pass with updated signature
- [x] `yarn lint` passes
- [x] `yarn server typecheck` passes

## Dependencies & Risks

**Dependencies:**
- `packages/game-logic` already exports all tag scoring utilities — no new package dependencies.
- `packages/db` already has `playerTagScoresRepo` — no schema changes needed.
- The local `GameController` already uses the local SQLite DB — tag score persistence is possible today.

**Risks:**
- **Phase 3 is large**: The `GameController` refactor touches question loading, round flow, scoring, and broadcasting. Consider splitting into sub-PRs.
- **Local mode profile resolution**: The local `WebSocketServer` currently has no concept of player profiles. Adding `deviceId` handling is straightforward but touches the WebSocket layer.
- **Pool exhaustion**: The local DB seeds only 12 sample questions. Games with many rounds may exhaust the pool. The caller (both server and local controller) must handle early game end when `remaining.length === 0`.

## References & Research

### Internal References

- Existing selection algorithm: `packages/game-logic/src/utils/questionSelection.ts:26-90`
- Tag scoring utilities: `packages/game-logic/src/utils/tagScoring.ts`
- Server game room: `apps/server/src/room.ts` (pool loading at ~336, selection at ~729, tag updates at ~786)
- Local controller: `apps/tv-host/src/services/GameController.ts` (loadQuestions at ~130, sequential iteration at ~162)
- WebSocket server: `apps/tv-host/src/services/WebSocketServer.ts` (JOIN handler at ~257)
- Brainstorm: `docs/brainstorms/2026-02-07-unified-question-selection-brainstorm.md`

### Design Decisions from Brainstorm

- Pool acquisition is mode-specific; selection is unified.
- Phase ramp lives in the per-round picker, not pool ordering.
- Tag scores are optional (graceful degradation).
- Pool composition is smart in both modes.
- Local mode optionally fetches tag scores from network if available.
