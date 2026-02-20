---
title: Meta Question Sets
type: feat
date: 2026-02-20
---

# Meta Question Sets

## Overview

Add "meta question sets" — a question set that aggregates multiple child question sets into a single selectable collection. When a meta set is selected in the TV lobby, questions from all child sets are loaded and served through the adaptive selection engine (`buildQuestionPool` → `selectNextQuestion`), not in sequential order. The host configures how many rounds to play.

Meta sets are managed from the admin dashboard (create, edit child membership, reorder, delete) and appear alongside regular sets in the TV lobby picker in both local and hosted modes.

## Problem Statement / Motivation

Currently, question sets are topic-specific (e.g., "Dragon Ball", "Zelda BOTW"). To play a varied game spanning multiple topics, you must use casual mode which pulls from the entire question pool indiscriminately. There's no way to curate a specific mix of topics — for example, "Anime Night" (Dragon Ball + Naruto + One Piece) or "Zelda Marathon" (BOTW + TOTK + Hyrule Warriors).

Meta sets solve this by letting admins compose collections of sets that the TV host can select as a single item.

## Proposed Solution

### Design Principles

- **Transparent to the protocol** — A meta set gets a regular `question_sets` row with an `is_meta` flag. The `ConfigureGamePayload.questionSetId` is just an opaque ID; no WS protocol changes needed.
- **No nesting** — Meta sets can only contain regular sets, not other meta sets. Simplifies implementation, avoids circular references.
- **Adaptive picking** — Meta set games use the casual selection pipeline (`buildQuestionPool` → `selectNextQuestion`) regardless of the `configured` game type, since questions from multiple sets should be mixed, not served sequentially.
- **Host-configured round count** — The host picks the number of rounds (meta sets can aggregate hundreds of questions).

### Database Changes (Migration V7)

Add `is_meta` column to `question_sets` and create a junction table:

```sql
-- Add is_meta flag to question_sets
ALTER TABLE question_sets ADD COLUMN is_meta INTEGER NOT NULL DEFAULT 0;

-- Junction table: which child sets belong to which meta set
CREATE TABLE IF NOT EXISTS meta_set_children (
  meta_set_id TEXT NOT NULL REFERENCES question_sets(id),
  child_set_id TEXT NOT NULL REFERENCES question_sets(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meta_set_id, child_set_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_set_children_meta
  ON meta_set_children(meta_set_id);
CREATE INDEX IF NOT EXISTS idx_meta_set_children_child
  ON meta_set_children(child_set_id);
```

**Soft delete behavior:** Deleting a meta set soft-deletes its `question_sets` row; junction rows are left in place (harmless, filtered by `deleted_at`). Deleting a child set soft-deletes that set; query-time filtering excludes its questions from any parent meta sets.

### Schema Types

```typescript
// packages/db/src/schema.ts

// Add to QuestionSetRow:
is_meta: number; // 0 or 1

// Add to QuestionSetWithMeta:
isMeta: boolean;
childSetIds?: string[]; // populated for meta sets

// New row type for the junction table:
export interface MetaSetChildRow {
  meta_set_id: string;
  child_set_id: string;
  sort_order: number;
}
```

### Repository Functions

New functions in `packages/db/src/repositories/questions.ts`:

- **`getQuestionsByMetaSet(db, metaSetId)`** — JOIN through `meta_set_children` to load all questions from non-deleted child sets. Returns `QuestionWithMeta[]`.
- **`createMetaSet(db, { name, description, defaultTimeLimit, childSetIds })`** — Insert a `question_sets` row with `is_meta = 1` and junction rows.
- **`updateMetaSetChildren(db, metaSetId, childSetIds)`** — Replace junction rows (delete old, insert new with sort order).
- **`getMetaSetChildren(db, metaSetId)`** — Return the child `QuestionSetWithMeta[]` in sort order.
- **Update `getQuestionSets()`** — For meta sets, compute `questionCount` dynamically by summing non-deleted child set counts (or a subquery).
- **Update `parseQuestionSetRow()`** — Map `is_meta` → `isMeta: boolean`.

### Game Flow Changes

Both `apps/server/src/room.ts` and `apps/tv-host/src/services/GameController.ts` need the same logic:

**In `configureGame()`:**
1. Check if the selected set has `is_meta = 1`.
2. If meta: load child set questions via `getQuestionsByMetaSet()`, validate non-empty.
3. Store the meta set ID as `this.questionSetId` (unchanged).

**In `startGame()` / `loadQuestionsAndStart()`:**
1. If the set is meta, route questions through the **casual pipeline**: `buildQuestionPool()` → `selectNextQuestion()` per round.
2. Use the host-configured `totalQuestions` (or default) as the round count, not the full question pool size.
3. The game type externally remains `configured` (since the user selected a specific set), but internally uses adaptive picking.

### Hosted Mode: Set Picker for TV Lobby

Currently the TV lobby's set picker only works in local mode (`if (mode !== 'local') return`). To support hosted mode:

1. **New API call from TV** — In hosted mode, `LobbyScreen` fetches sets from `GET /api/question-sets` on the server.
2. **Remove the local-mode guard** — Let `loadQuestionSets` work in both modes, using either direct DB access (local) or an HTTP fetch (hosted).
3. **The existing `CONFIGURE_GAME` message** already carries `questionSetId` — no protocol change needed.

### Admin Dashboard UI

Add meta set management to `apps/server/admin/question-sets.html` (or a new `meta-sets.html` page):

**Create meta set:**
- Name input, optional description
- Child set picker: list of all regular (non-meta, non-deleted) sets with checkboxes
- Save creates the meta set with selected children

**Edit meta set:**
- Same form, pre-populated with current children
- Add/remove children, reorder via drag-and-drop or up/down buttons
- Save replaces junction rows

**Display:**
- Meta sets shown with a visual badge/indicator (e.g., "Collection" label)
- Show child set count and total aggregated question count
- Expand to see list of child sets (not individual questions)

**API endpoints:**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/meta-sets` | Create a meta set (name, description, childSetIds) |
| `GET` | `/api/meta-sets/:id` | Get meta set with resolved children |
| `PUT` | `/api/meta-sets/:id` | Update name/description/children |
| `DELETE` | `/api/meta-sets/:id` | Soft-delete (reuses existing soft-delete) |

Regular `GET /api/question-sets` returns both regular and meta sets (with `isMeta` flag), so the TV lobby can fetch all sets in one call.

### TV Lobby Picker

In `LobbyScreen.tsx`, meta sets appear in the same horizontal `ScrollView`:
- Visual distinction: show child set count (e.g., "3 sets · 150 questions")
- Selection works identically to regular sets: `configureGame('configured', metaSetId)`
- The `GAME_CONFIGURED` response reflects the aggregated question count

### Question Count & Time Limit

- **Question count:** Computed at query time for meta sets — SUM of non-deleted child set question counts. Not stored on the meta set row (avoids stale data).
- **Time limit:** Each question retains its own `time_limit`. Fallback chain: question's `time_limit` → child set's `default_time_limit` → meta set's `default_time_limit` → server default. The meta set's `default_time_limit` acts as a final fallback.
- **Deduplication:** No dedup across child sets. Each question has a unique DB `id`; even if two sets have similar questions, they're distinct rows. The selection engine's "already asked" tracking prevents repeats within a game.

## Technical Considerations

- **Two parallel code paths:** Both `room.ts` (hosted) and `GameController.ts` (local) must be updated with identical meta-set logic. Consider extracting a shared helper.
- **Performance:** A meta set with 5 child sets of 100 questions = 500 questions into `buildQuestionPool`. The selection engine handles this fine (it's designed for 3× pools).
- **`question_count` on the meta set row:** Set to 0 at creation (no direct questions). The `getQuestionSets()` query computes the real count via a subquery for meta sets.
- **Validation:** Admin UI prevents creating a meta set with zero children. The `configureGame` flow validates the resolved question count > 0.

## Acceptance Criteria

- [x] DB migration V7 adds `is_meta` column and `meta_set_children` junction table
- [x] Admin can create a meta set, selecting child sets from existing regular sets
- [x] Admin can edit a meta set to add/remove/reorder child sets
- [x] Admin can delete a meta set without affecting child sets
- [x] Meta sets appear in `GET /api/question-sets` with `isMeta: true` and computed `questionCount`
- [x] TV lobby shows meta sets with visual distinction in both local and hosted modes
- [x] Selecting a meta set and starting a game loads all child set questions
- [x] Meta set games use adaptive picking (`buildQuestionPool` → `selectNextQuestion`), not sequential order
- [x] Host can configure number of rounds for meta set games
- [x] Soft-deleting a child set excludes its questions from parent meta sets
- [x] Meta sets cannot contain other meta sets (enforced in admin UI and API)
- [x] Game history records the meta set ID in `GameRow.question_set_id`

## Dependencies & Risks

- **Hosted-mode set picker** is new functionality beyond just meta sets — it enables picking regular sets in hosted mode too (currently impossible). This is a bonus but adds scope.
- **Two code paths** (room.ts + GameController.ts) increase the risk of divergent behavior. Shared helpers mitigate this.
- **No existing tests** for the admin dashboard UI (vanilla HTML/JS). Manual testing required.

## References

- Current question set schema: `packages/db/src/schema.ts:5-16`
- Question set repository: `packages/db/src/repositories/questions.ts:121-162`
- Room.ts configureGame: `apps/server/src/room.ts:475-523`
- Room.ts startGame: `apps/server/src/room.ts:527-588`
- GameController configureGame: `apps/tv-host/src/services/GameController.ts:654-673`
- GameController loadQuestionsAndStart: `apps/tv-host/src/services/GameController.ts:178-222`
- LobbyScreen set picker: `apps/tv-host/src/screens/LobbyScreen.tsx:241-279`
- WS protocol ConfigureGamePayload: `packages/ws-protocol/src/messages.ts:148-153`
- Migration system: `packages/db/src/migrations.ts:140-188`
- Existing many-to-many pattern (player_tag_scores): `packages/db/src/migrations.ts:100-120`
