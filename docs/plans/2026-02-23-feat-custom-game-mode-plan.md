---
title: "feat: Add Custom Game Mode"
type: feat
date: 2026-02-23
---

# feat: Add Custom Game Mode

## Overview

Add a third game mode ("custom") to the TV Lobby Screen that gives the admin full control over game setup: language, multiple question sets, total question count, seconds per question, and an adaptive mode toggle. Questions from selected sets are shuffled randomly. This sits between the simplicity of "casual" (fully random) and the rigidity of "configured" (single set, authored order).

## Problem Statement / Motivation

Currently there are only two game modes:
- **Casual**: fully random questions from the general pool, no adaptive scoring/selection
- **Configured**: single question set, authored order (or meta set with adaptive selection)

Neither allows an admin to say "I want 15 shuffled questions from *these 3 sets*, with 20 seconds per question, and catch-up mechanics enabled." The custom mode fills this gap, giving hosts flexibility for party scenarios where they want control without having to pre-create a meta set.

## Proposed Solution

Add `'custom'` as a third `gameType` alongside `'casual'` and `'configured'`. The custom mode:
- Accepts **1+ question set IDs** (multi-select on the TV lobby)
- **Meta sets are excluded** from the Custom picker (they have no direct questions; use Configured mode for meta sets instead)
- Sets filtered by the current **language**
- Configurable **total question count** (capped at sum of available questions across selected sets, minimum 1)
- Configurable **seconds per question** (overrides per-question time limits, range 5–60, default 15)
- **Adaptive mode toggle** controlling both:
  - `computeTimeBonusMultiplier` (position-based catch-up)
  - Tag-based adaptive question selection (`selectNextQuestion` / `buildQuestionPool`)
- Questions from all selected sets are **shuffled randomly**

## Design Decisions

### Meta sets excluded from Custom picker
Meta sets store no questions directly — their questions are joined via `meta_set_children`. The `getQuestionsBySetIds` query (`WHERE set_id IN (...)`) returns 0 rows for meta set IDs. Rather than adding complex expansion logic, we exclude meta sets from the Custom picker. Admins who want meta-set behavior should use Configured mode.

### Adaptive pipeline ordering
- **Adaptive ON**: load all questions from selected sets → pass full pool to `buildQuestionPool(pool, { nRounds })` → use `selectNextQuestion` per round from the resulting curated pool.
- **Adaptive OFF**: load all questions from selected sets → Fisher-Yates shuffle → slice to `totalQuestions` → serve in shuffled order.

The shuffle-then-slice must NOT happen before `buildQuestionPool` when adaptive is ON, because `buildQuestionPool` needs a pool larger than `nRounds` to curate from (typically 3×).

### DB storage for multi-set association
Store `questionSetIds` as a JSON array string in a new `question_set_ids TEXT` column on the `games` table (migration V12). The existing `question_set_id` column remains null for custom games. This preserves which sets were used for analytics without requiring a junction table.

### DB write guards
The current code only writes game sessions, round results, tag scores, and player stats for `gameType === 'configured'`. For custom mode:
- **Game session + round results + player stats**: always write (both adaptive ON and OFF)
- **Tag score updates + `games_played` increment**: only write when `adaptiveMode === true`

This means updating the guard from `gameType === 'configured'` to `gameType !== 'casual'` for game/round/stats writes, and adding a separate `adaptiveMode` check for tag score writes.

### Config persists across reset
After `resetGame`, `GameConfig` (including `questionSetIds`, `adaptiveMode`) is preserved. This lets the admin do quick rematches with the same settings. The mode buttons on the lobby still work to switch away from Custom.

## Technical Approach

### 1. Protocol Layer (`packages/ws-protocol/src/messages.ts`)

Extend `ConfigureGamePayload`:

```typescript
export interface ConfigureGamePayload {
  gameType: 'casual' | 'configured' | 'custom';
  questionSetId?: string;        // configured mode (single set)
  questionSetIds?: string[];     // custom mode (multi-set)
  totalQuestions?: number;
  questionTimeLimit?: number;
  adaptiveMode?: boolean;        // custom mode only
}
```

Extend `GAME_CONFIGURED` payload:

```typescript
| {
    type: 'GAME_CONFIGURED';
    payload: {
      gameType: string;
      questionCount: number;
      questionSetId?: string;
      questionSetIds?: string[];
      adaptiveMode?: boolean;
    };
  }
```

### 2. Game Logic State (`packages/game-logic/src/slices/gameSlice.ts`)

Extend `GameConfig`:

```typescript
export interface GameConfig {
  questionTimeLimit: number;
  totalQuestions: number;
  minPlayers: number;
  gameType?: 'casual' | 'configured' | 'custom';
  questionSetId?: string;
  questionSetIds?: string[];
  adaptiveMode?: boolean;
}
```

### 3. DB Schema (`packages/db/src/schema.ts`)

Extend `GameType`:

```typescript
export type GameType = 'casual' | 'configured' | 'custom';
```

### 4. DB Migration V12

Add `question_set_ids TEXT` column to `games` table:

```sql
ALTER TABLE games ADD COLUMN question_set_ids TEXT;
```

### 5. Questions Repository (`packages/db/src/repositories/questions.ts`)

Add a function to load questions from multiple sets (excluding meta sets and soft-deleted sets):

```typescript
export async function getQuestionsBySetIds(
  db: DbAdapter,
  setIds: string[],
): Promise<QuestionWithMeta[]> {
  const placeholders = setIds.map(() => '?').join(',');
  const rows = await db.all<QuestionRow>(
    `SELECT * FROM questions WHERE set_id IN (${placeholders})
     AND set_id NOT IN (SELECT id FROM question_sets WHERE deleted_at IS NOT NULL)`,
    setIds,
  );
  return rows.map(rowToQuestionWithMeta);
}
```

### 6. Server Room (`apps/server/src/room.ts`)

**New fields on `GameRoom`:**
- `private questionSetIds: string[] = []`
- `private adaptiveMode = false`

**`configureGame`** — add `'custom'` branch:
- Validate all set IDs exist, are non-meta, are non-empty
- Store `questionSetIds`, `adaptiveMode`, `configuredTotalQuestions`, `configuredTimeLimit`
- Server-side bounds: `totalQuestions >= 1`, `questionTimeLimit >= 1`
- Respond with `GAME_CONFIGURED` including `questionSetIds` and `adaptiveMode`

**`startGame`** — add custom path:
- Load tag scores if `adaptiveMode` is true
- Load questions via `getQuestionsBySetIds(db, this.questionSetIds)`
- If `adaptiveMode`:
  - Pass full pool to `buildQuestionPool(pool, { nRounds, playerTagScores })`
  - Store pool; use `selectNextQuestion` per round in `showNextQuestion`
- If not adaptive:
  - Fisher-Yates shuffle the loaded questions
  - Slice to `configuredTotalQuestions`
  - Store as `this.questions`; serve in order
- Create game session for `gameType !== 'casual'` (not just `'configured'`)
- Pass `this.questionSetIds` as JSON to the new `question_set_ids` column

**`showRoundResults`:**
- Gate `computeTimeBonusMultiplier`: skip (use multiplier = 1.0) when `gameType === 'custom' && !adaptiveMode`
- Gate `updateTagScoresAfterRound`: skip when `!adaptiveMode` (for custom games)
- Gate `insertRoundResults` + `recordGameEnd`: fire for `gameType !== 'casual'`

### 7. Local GameController (`apps/tv-host/src/services/GameController.ts`)

Mirror the server changes:
- Store `questionSetIds` and `adaptiveMode` fields
- `configureGame` accepts new fields, validates sets from local DB
- `loadQuestionsAndStart` handles `'custom'` with multi-set loading + adaptive/non-adaptive paths
- Score calculation respects `adaptiveMode` toggle
- Game-end DB writes fire for `gameType !== 'casual'`; tag writes only when `adaptiveMode`

### 8. IGameController Interface (`apps/tv-host/src/services/IGameController.ts`)

```typescript
export interface IGameController {
  // ...existing...
  configureGame(
    gameType: 'casual' | 'configured' | 'custom',
    questionSetId?: string,
    options?: {
      questionSetIds?: string[];
      totalQuestions?: number;
      questionTimeLimit?: number;
      adaptiveMode?: boolean;
    },
  ): void;
  // ...
}
```

### 9. HostedGameController (`apps/tv-host/src/services/HostedGameController.ts`)

- `configureGame`: forward `questionSetIds`, `totalQuestions`, `questionTimeLimit`, `adaptiveMode` in the `CONFIGURE_GAME` payload
- `GAME_CONFIGURED` handler: fix the unsafe cast from `'casual' | 'configured'` to include `'custom'`; store `questionSetIds` and `adaptiveMode` via `updateConfig`

### 10. useGameController Hook (`apps/tv-host/src/hooks/useGameController.ts`)

Update `configureGame` callback to accept and pass through the new options parameter.

### 11. TV Lobby UI (`apps/tv-host/src/screens/LobbyScreen.tsx`)

**Mode selector**: Add "Custom" button. Widen `selectedMode` state type to `'casual' | 'configured' | 'custom'`.

**When Custom is selected**, show below the mode buttons:
- **Multi-select set picker**: reuse the horizontal `ScrollView` of set cards. Filter out meta sets (`!set.isMeta`). Allow toggling multiple cards on/off. Track `selectedSetIds: string[]` in local state.
- **Total questions stepper**: +/- buttons. Default = sum of selected sets' question counts. Clamped to [1, sum]. Auto-clamp when sets are toggled.
- **Seconds per question stepper**: +/- buttons. Default 15, range [5, 60].
- **Adaptive mode toggle**: `Pressable` that toggles on/off, default ON.

Each change calls `configureGame('custom', undefined, { questionSetIds, totalQuestions, questionTimeLimit, adaptiveMode })`.

**Start Game button**: disabled when `selectedMode === 'custom' && selectedSetIds.length === 0`.

**TV remote focus navigation**: The Custom button sits after Configured. Update `nextFocus*` props:
- Configured `nextFocusRight` → Custom button (not Start)
- Custom `nextFocusRight` → Start button
- Custom `nextFocusDown` → first set card
- Set cards `nextFocusDown` → stepper row
- Stepper +/- buttons use `nextFocusRight`/`nextFocusLeft` for horizontal traversal
- Adaptive toggle `nextFocusRight` → Start button

### 12. i18n (`packages/i18n/src/locales/`)

Add keys in both EN and IT:

```json
{
  "gameConfig.custom": "Custom",
  "gameConfig.totalQuestionsLabel": "Questions",
  "gameConfig.secondsPerQuestion": "Seconds",
  "gameConfig.adaptiveMode": "Adaptive",
  "gameConfig.selectSets": "Select at least one set",
  "gameConfig.selectedSets_one": "{{count}} set selected",
  "gameConfig.selectedSets_other": "{{count}} sets selected"
}
```

## Acceptance Criteria

- [x] Third "Custom" button appears on TV lobby alongside Casual and Configured
- [x] Selecting Custom shows multi-select set picker (meta sets excluded), question count stepper, time limit stepper, adaptive toggle
- [x] Sets are filtered by the current language
- [x] Selecting/deselecting sets updates the max question count; count auto-clamps downward
- [x] Start Game is disabled when no sets are selected in Custom mode
- [x] Start Game loads questions from all selected sets, shuffled randomly
- [x] When adaptive mode is ON: time bonus catch-up and tag-based selection are active
- [x] When adaptive mode is OFF: no catch-up multiplier, no tag-based selection, purely shuffled order
- [x] Custom mode works in both local (TV GameController) and hosted (HostedGameController + server room)
- [x] Game results are recorded in the `games` table with `game_type = 'custom'` and `question_set_ids` JSON
- [x] Tag scores are only updated when adaptive mode is ON
- [x] Server validates `totalQuestions >= 1` and `questionTimeLimit >= 1`
- [x] TV remote D-pad navigation works correctly through all Custom mode controls
- [x] Language switch while in Custom mode clears selected sets and reloads the picker
- [x] Config persists across game reset (Play Again keeps Custom settings)

## Dependencies & Risks

- **Cascading type changes**: Adding `'custom'` to `GameType` requires updating all switch/if branches that check `gameType`. Key locations: `room.ts` (4 guards), `GameController.ts` (3 guards), `HostedGameController.ts` (1 cast), `gameSlice.ts` (type), `LobbyScreen.tsx` (state type + handler).
- **Lobby UI real estate**: The TV lobby has limited space. Custom controls (set picker + steppers + toggle) need to fit in the left panel below the mode buttons. Use compact horizontal layout for steppers on a single row.
- **Backward compatibility**: Old clients that don't know about `'custom'` will receive it in `GAME_CONFIGURED`. The mobile client doesn't use `gameType` for rendering, so this is safe.
- **configurePromise race**: Rapid CONFIGURE_GAME messages can overwrite `this.configurePromise` before the first is awaited. Low-probability in practice (user must press Start immediately after config change), but worth noting.

## File Change Summary

| File | Change |
|------|--------|
| `packages/ws-protocol/src/messages.ts` | Add `questionSetIds`, `adaptiveMode` to `ConfigureGamePayload`; extend `GAME_CONFIGURED` payload |
| `packages/game-logic/src/slices/gameSlice.ts` | Add `questionSetIds`, `adaptiveMode` to `GameConfig`; widen `gameType` union |
| `packages/db/src/schema.ts` | Add `'custom'` to `GameType` union |
| `packages/db/src/migrations.ts` | V12: add `question_set_ids TEXT` column to `games` |
| `packages/db/src/repositories/questions.ts` | Add `getQuestionsBySetIds()` function |
| `apps/server/src/room.ts` | Handle `'custom'` in `configureGame`, `startGame`, `showRoundResults`; update DB-write guards |
| `apps/tv-host/src/services/IGameController.ts` | Update `configureGame` signature |
| `apps/tv-host/src/services/GameController.ts` | Handle `'custom'` in `configureGame`, `loadQuestionsAndStart`, scoring; update DB-write guards |
| `apps/tv-host/src/services/HostedGameController.ts` | Forward new payload fields; fix `gameType` cast; handle `questionSetIds`/`adaptiveMode` in `GAME_CONFIGURED` |
| `apps/tv-host/src/hooks/useGameController.ts` | Update `configureGame` callback signature |
| `apps/tv-host/src/screens/LobbyScreen.tsx` | Add Custom mode button, multi-select picker, steppers, toggle; update focus graph |
| `packages/i18n/src/locales/en/translation.json` | Add new translation keys with pluralization |
| `packages/i18n/src/locales/it/translation.json` | Add new translation keys (Italian) with pluralization |

## References

- Current game configuration flow: `apps/server/src/room.ts:507-559`
- DB-write guards to update: `apps/server/src/room.ts:575,628,1016,1099` and `apps/tv-host/src/services/GameController.ts:201,640,731`
- Existing set picker UI: `apps/tv-host/src/screens/LobbyScreen.tsx:382-427`
- Tag-based selection pipeline: `packages/game-logic/src/utils/questionSelection.ts`
- Time bonus catch-up: `packages/game-logic/src/utils/scoring.ts` → `computeTimeBonusMultiplier`
- WS protocol types: `packages/ws-protocol/src/messages.ts:149-161`
- Focus navigation refs: `apps/tv-host/src/screens/LobbyScreen.tsx:214-232`
- `HostedGameController` unsafe cast: `apps/tv-host/src/services/HostedGameController.ts:259`
