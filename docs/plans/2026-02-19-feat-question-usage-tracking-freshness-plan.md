---
title: Question Usage Tracking & Freshness
type: feat
date: 2026-02-19
---

# Question Usage Tracking & Freshness

## Overview

Add global usage tracking (`times_asked`, `last_asked_at`) to questions, use freshness to avoid repeating recently-asked questions across games, and unify the default questions-per-game to 10 in both hosted and local modes.

## Problem Statement

- Questions have no usage history — the system can't tell if a question was asked 5 minutes ago or never.
- `getRandomQuestions()` uses `ORDER BY RANDOM()`, so back-to-back games can repeat the same questions.
- Hosted mode defaults to 5 questions per game while local mode defaults to 10 — an inconsistency.
- Within-game dedup already works via `usedQuestionIds: Set<string>` in both modes.

## Proposed Solution

1. **DB migration (V6)**: Add `times_asked INTEGER NOT NULL DEFAULT 0` and `last_asked_at TEXT DEFAULT NULL` to the `questions` table.
2. **Repository function**: `questionsRepo.markQuestionAsked(db, questionId)` — fire-and-forget update after each round.
3. **Freshness-aware loading**: Modify `getRandomQuestions()` to use `ORDER BY last_asked_at ASC NULLS FIRST, RANDOM()` — never-played questions surface first, then oldest-asked, with randomness breaking ties among equally-fresh questions.
4. **Unify default**: Change `TOTAL_QUESTIONS` in `room.ts` from 5 to 10.

## Technical Approach

### 1. Migration — `packages/db/src/migrations.ts`

Add migration V6:

```sql
ALTER TABLE questions ADD COLUMN times_asked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN last_asked_at TEXT DEFAULT NULL;
```

Update `LATEST_VERSION` to 6. Existing rows get `times_asked = 0` and `last_asked_at = NULL` automatically.

### 2. Type Updates — `packages/db/src/schema.ts`

Add to `QuestionRow`:
- `times_asked: number`
- `last_asked_at: string | null`

Add to `QuestionWithMeta`:
- `timesAsked: number`
- `lastAskedAt: string | null`

Update `rowToQuestionWithMeta()` in `packages/db/src/repositories/questions.ts` to map the new fields.

### 3. Repository Function — `packages/db/src/repositories/questions.ts`

```typescript
export async function markQuestionAsked(db: DbAdapter, questionId: string): Promise<void> {
  await db.runAsync(
    `UPDATE questions SET times_asked = times_asked + 1, last_asked_at = datetime('now') WHERE id = ?`,
    [questionId],
  );
}
```

### 4. Freshness-Aware Query — `packages/db/src/repositories/questions.ts`

Modify `getRandomQuestions()`:

```sql
-- Before:
SELECT * FROM questions ... ORDER BY RANDOM() LIMIT ?

-- After:
SELECT * FROM questions ... ORDER BY last_asked_at IS NOT NULL, last_asked_at ASC, RANDOM() LIMIT ?
```

This ensures:
- `last_asked_at IS NULL` rows come first (never played).
- Among played questions, oldest-asked come next.
- Ties broken randomly — preserves diversity for `buildQuestionPool`.

**Only casual mode** uses `getRandomQuestions()`. Configured mode (`getQuestionsBySet()`) keeps its authored order unchanged.

### 5. Trigger Updates in Game Flow

**Hosted mode** — `apps/server/src/room.ts` in `showRoundResults()`:
Add fire-and-forget call alongside existing `gamesRepo.insertRoundResults`:

```typescript
questionsRepo.markQuestionAsked(this.db, currentQuestion.id).catch(err =>
  console.error("Failed to update question usage:", err)
);
```

**Local mode** — `apps/tv-host/src/services/GameController.ts` in `showRoundResults()`:
Same pattern. Note: local mode currently has no per-round DB writes, so this is new — but follows the existing fire-and-forget pattern used for tag score updates.

**Both modes, both game types** (casual and configured) should update counters. Tracking is always useful even if configured mode doesn't use freshness for selection.

### 6. Unify Default — `apps/server/src/room.ts`

```typescript
// Line 49: change from 5 to 10
const TOTAL_QUESTIONS = 10;
```

Local mode already defaults to 10 in `gameSlice.ts:78`.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Cold start (all `last_asked_at = NULL`) | All questions equally fresh → falls back to random, same as current behavior |
| Small corpus (12 questions, 10 per game) | After 2 games, all questions used. `ORDER BY last_asked_at ASC, RANDOM()` maximizes spacing between repeats — oldest-asked come first |
| Concurrent rooms (hosted) | Both rooms may load the same "freshest" questions since they query before either has served rounds. Acceptable — freshness is a soft preference, not a hard guarantee |
| Question re-import | New rows get `times_asked = 0, last_asked_at = NULL` → naturally prioritized |
| Configured mode | Counters updated but ordering unaffected — questions served in authored order |

## Files to Change

| File | Change |
|---|---|
| `packages/db/src/migrations.ts` | Add V6 migration with two ALTER TABLE statements |
| `packages/db/src/schema.ts` | Add `times_asked`, `last_asked_at` to `QuestionRow` and `QuestionWithMeta` |
| `packages/db/src/repositories/questions.ts` | Add `markQuestionAsked()`, update `rowToQuestionWithMeta()`, modify `getRandomQuestions()` ORDER BY |
| `apps/server/src/room.ts` | Call `markQuestionAsked()` in `showRoundResults()`, change `TOTAL_QUESTIONS` to 10 |
| `apps/tv-host/src/services/GameController.ts` | Call `markQuestionAsked()` in `showRoundResults()` |

## Acceptance Criteria

- [x] `times_asked` increments by 1 each time a question is served in any game mode
- [x] `last_asked_at` updates to current UTC timestamp each time a question is served
- [x] Newly imported questions (NULL `last_asked_at`) are preferred over recently-asked ones in casual mode
- [x] Back-to-back casual games avoid repeating the same questions when the corpus is large enough
- [x] Small corpus gracefully degrades — maximizes spacing between repeats rather than failing
- [x] Default questions per game is 10 in both hosted and local modes
- [x] No duplicate questions within a single game (existing behavior preserved)
- [x] Both `expo-sqlite` (local) and `bun:sqlite` (hosted) adapters handle the migration correctly

## Out of Scope

- Admin dashboard UI for viewing question usage stats (can be added separately)
- Admin action to reset usage counters
- Per-player question tracking (tracking is global per question)
- Freshness filtering for configured-mode question ordering
