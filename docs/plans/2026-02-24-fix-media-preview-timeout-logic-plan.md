---
title: Fix media preview timeout logic
type: fix
date: 2026-02-24
---

# Fix media preview timeout logic

## Problem Statement

When questions have images, the timeout logic for showing the media preview is broken. The intended behavior is:

1. **If the image loads** on the TV, it should be displayed for **5 seconds** (the `previewDuration`), then show the question.
2. **If the image doesn't render within 10 seconds**, skip the preview entirely and show the question immediately.

### Current (buggy) behavior

Both `apps/server/src/room.ts` and `apps/tv-host/src/services/GameController.ts` share the same logic:

1. `showNextQuestion()` starts a **5-second** `mediaLoadWaitTimeout` waiting for the host TV to signal `MEDIA_LOADED`.
2. When that 5s timeout fires (image didn't load in time), `startPreviewCountdown()` is called — which then waits **another** `previewDuration` seconds (default 5) before sending the question.
3. This means: even if the image never loaded, the player waits up to **10 seconds total** (5s load wait + 5s preview of nothing).

Additionally, `MediaPreviewScreen.tsx` calls `notifyMediaLoaded()` both on success (`onLoad`) AND on failure (`onError` or missing URL). The server can't distinguish between the two, so on error it still runs the full preview countdown on a blank/fallback screen.

### Desired behavior

- Max wait for image load: **10 seconds**
- Image loads within 10s → display for `previewDuration` seconds → show question
- Image fails quickly (404, etc.) → skip preview immediately → show question
- Image doesn't load within 10s → skip preview immediately → show question

## Proposed Solution

### 1. Protocol change: add `success` flag to `MEDIA_LOADED`

**File:** `packages/ws-protocol/src/messages.ts:160`

```typescript
| { type: 'MEDIA_LOADED'; payload?: { success: boolean } };
```

Keep backward-compatible: treat missing payload as `success: true` (legacy clients).

### 2. Update `IGameController` interface

**File:** `apps/tv-host/src/services/IGameController.ts:21`

```typescript
notifyMediaLoaded(success?: boolean): void;
```

### 3. Fix server timeout logic

**File:** `apps/server/src/room.ts` — `showNextQuestion()` (line ~810)

- Change `mediaLoadWaitTimeout` from `5000` → `10000`
- When timeout fires: call `sendQuestion(q)` directly instead of `startPreviewCountdown()`

**File:** `apps/server/src/room.ts` — `onMediaLoaded()` (line ~820)

- Accept `success` parameter (default `true`)
- If `success` → clear timeout, call `startPreviewCountdown()` (existing behavior)
- If `!success` → clear timeout, clear `waitingForMediaLoad`, call `sendQuestion()` directly

### 4. Same fix in local-mode GameController

**File:** `apps/tv-host/src/services/GameController.ts` — same changes as room.ts:

- `showNextQuestion()` (line ~392): change `5000` → `10000`, timeout fires → `sendQuestion()` directly
- `notifyMediaLoaded(success)` (line ~443): branch on success/failure

### 5. Update HostedGameController

**File:** `apps/tv-host/src/services/HostedGameController.ts:108`

```typescript
notifyMediaLoaded(success = true): void {
  this.send({ type: 'MEDIA_LOADED', payload: { success } });
}
```

### 6. Update MediaPreviewScreen

**File:** `apps/tv-host/src/screens/MediaPreviewScreen.tsx`

- `onLoad` → `notifyMediaLoaded(true)` (image rendered successfully)
- `onError` → `notifyMediaLoaded(false)` (image failed)
- No imageUrl → `notifyMediaLoaded(false)` (nothing to show)

### 7. Update useGameController hook

**File:** `apps/tv-host/src/hooks/useGameController.ts:52`

Pass through the `success` parameter.

### 8. Update room.ts host message handler

**File:** `apps/server/src/room.ts:435`

```typescript
case 'MEDIA_LOADED':
  this.onMediaLoaded(message.payload?.success ?? true);
  break;
```

### 9. Update existing tests

**File:** `apps/server/src/__tests__/phase4-media-config.test.ts`

- Update "sends MEDIA_PREVIEW before QUESTION" test: the test currently doesn't send `MEDIA_LOADED`, so it relies on the 5s load timeout + 1s preview. With the new logic, the 10s timeout will fire and skip the preview entirely. Either:
  - Have the mock host send `MEDIA_LOADED` with `success: true` to test the happy path, OR
  - Adjust timing expectations

- Add new test: "skips preview when MEDIA_LOADED reports failure"
- Add new test: "skips preview when 10s load timeout fires"

## Acceptance Criteria

- [ ] Image loads quickly → displayed for `previewDuration` seconds → question shown
- [ ] Image loads slowly (e.g. 8s) → displayed for `previewDuration` seconds → question shown
- [ ] Image fails (404/error) → question shown immediately (no blank preview)
- [ ] Image never loads → after 10s, question shown immediately
- [ ] Works in both hosted mode (room.ts) and local mode (GameController.ts)
- [ ] Existing tests updated and passing
- [ ] New test coverage for failure and timeout paths
