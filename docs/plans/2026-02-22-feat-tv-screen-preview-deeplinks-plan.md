---
title: "feat: TV Screen Preview via Deeplinks"
type: feat
date: 2026-02-22
---

# TV Screen Preview via Deeplinks

## Overview

Add a preview mode to the TV host app that lets developers jump directly to any game phase screen (LOBBY, COUNTDOWN, MEDIA_PREVIEW, QUESTION, REVEALING, RESULTS, GAME_OVER) with realistic mock data. Supports Android TV via ADB intents and Web via URL query params. Gated behind `__DEV__` so it never ships in production.

## Problem Statement

Testing TV screens currently requires playing through the entire game flow — creating a room, joining players from phones, starting a game, and waiting for the right phase. This makes visual iteration painfully slow, especially for screens deep in the flow like RESULTS or GAME_OVER that require multiple rounds of play to reach.

## Proposed Solution

Three pieces working together:

1. **`PreviewGameController`** — implements `IGameController` with a Redux store pre-loaded to the target phase's state (bypassing transition validation)
2. **Preview entry point in `App.tsx`** — detects `?preview=PHASE` (web) or intent URI `unfairenough-tv://preview?phase=PHASE` (Android TV), skips normal navigation, and renders `GameScreen` with the preview controller
3. **Shell script `scripts/preview-screen.sh`** — one-liner DX for both platforms

### Entry Points

| Platform    | Mechanism                                                              | Example                                                  |
|-------------|------------------------------------------------------------------------|----------------------------------------------------------|
| Web         | URL query param                                                        | `http://localhost:8082/?preview=QUESTION`                 |
| Android TV  | ADB intent with custom URI scheme                                      | `adb shell am start -a android.intent.action.VIEW -d "unfairenough-tv://preview?phase=QUESTION" com.unfairenough.tvhost` |
| Both        | Shell script                                                           | `./scripts/preview-screen.sh QUESTION [web\|android]`    |

## Technical Approach

### 1. Extend `createStore()` to accept preloaded state

**File:** `packages/game-logic/src/store/index.ts`

The Redux `VALID_TRANSITIONS` map prevents jumping directly to arbitrary phases via dispatched actions. The cleanest bypass is `configureStore`'s native `preloadedState` support.

```typescript
// Before
export const createStore = () => configureStore({ ... });

// After
export const createStore = (preloadedState?: { game: GameState; players: PlayersState }) =>
  configureStore({ ..., preloadedState });
```

Non-breaking change — all existing callers pass no args.

### 2. Create mock data factory

**New file:** `apps/tv-host/src/preview/previewData.ts`

Exports a function `buildPreviewState(phase: GamePhase): RootState` that returns a complete Redux state snapshot for any phase. Key data:

- **4 mock players** with distinct colors, emoji, and varied scores (entity adapter format: `{ ids: [...], entities: {...} }`)
- **1 sample question** from `sampleQuestions` (for QUESTION, RESULTS phases)
- **Round results** with a mix of correct/incorrect answers, varying response times and scores
- **Rankings** — all 4 players ranked by score
- **Position history** — 5 rounds of shuffled rankings (needed for GAME_OVER chart which requires `length > 1`)
- **Mock answers** — 2 of 4 players answered (shows "2/4 answered" counter on QUESTION screen)
- **Room code** — `"PREV"` (visible on LOBBY)
- **Config** — `{ totalQuestions: 10, questionTimeLimit: 15, minPlayers: 1 }`

### 3. Create `PreviewGameController`

**New file:** `apps/tv-host/src/preview/PreviewGameController.ts`

Implements `IGameController`:

| Method            | Behavior                                                     |
|-------------------|--------------------------------------------------------------|
| `initialize()`    | No-op (idempotent, safe for React strict mode double-call)   |
| `getState()`      | Returns store's current state                                |
| `subscribe(cb)`   | Delegates to `store.subscribe(cb)`                           |
| `startGame()`     | No-op                                                        |
| `reset()`         | No-op                                                        |
| `configureGame()` | No-op                                                        |
| `setLanguage(l)`  | Calls `changeLanguage(l)` (i18n only, no server call)        |
| `cleanup()`       | No-op                                                        |

Constructor takes a `GamePhase`, calls `buildPreviewState(phase)`, passes result as `preloadedState` to `createStore()`.

### 4. Add preview detection to `App.tsx`

**File:** `apps/tv-host/App.tsx`

Add a new `AppScreen` variant `'preview'` and detect it at initialization:

```typescript
type AppScreen = 'mode_select' | 'local_game' | 'connect' | 'hosted_game' | 'preview';

function getPreviewPhase(): GamePhase | null {
  if (!__DEV__) return null;
  if (Platform.OS === 'web') {
    const params = new URLSearchParams(window.location.search);
    return params.get('preview') as GamePhase | null;
  }
  // Android: handled via Linking.getInitialURL() — parsed in useEffect
  return null;
}
```

For **web**: synchronous — read `window.location.search` in the `useState` initializer, set initial screen to `'preview'` if param present.

For **Android TV**: asynchronous — use React Native's built-in `Linking.getInitialURL()` in a `useEffect` to parse `unfairenough-tv://preview?phase=QUESTION` and transition to `'preview'` screen. No extra dependency needed — `Linking` is in `react-native` core.

The `'preview'` case renders:

```tsx
case 'preview':
  return (
    <GameModeProvider mode="hosted" controller={previewControllerRef.current!}>
      <GameScreen />
    </GameModeProvider>
  );
```

Uses `mode="hosted"` (not a new mode) because:
- `LobbyScreen` skips its fetch when `serverUrl` is undefined — which it will be
- `useBgMusic` silently catches fetch failures
- Adding a third mode would require auditing every `mode` check across all screens

### 5. Register URI scheme for Android TV

**File:** `apps/tv-host/app.config.ts`

Add the `scheme` property to the Expo config:

```typescript
scheme: 'unfairenough-tv',
```

This makes Expo's config plugin add the intent filter to `AndroidManifest.xml` on next `prebuild`. Handles both cold start and warm start URI resolution.

### 6. Shell script

**New file:** `scripts/preview-screen.sh`

```bash
#!/bin/bash
# Usage: ./scripts/preview-screen.sh <PHASE> [web|android]
# Examples:
#   ./scripts/preview-screen.sh QUESTION
#   ./scripts/preview-screen.sh RESULTS android
#   ./scripts/preview-screen.sh GAME_OVER web
```

Behavior:
- Validates phase against known list (`LOBBY|COUNTDOWN|MEDIA_PREVIEW|QUESTION|REVEALING|RESULTS|GAME_OVER`)
- Defaults to `web` if no platform argument
- **web**: opens `http://localhost:8082/?preview=PHASE` in default browser (`open` on macOS)
- **android**: runs `adb shell am start -a android.intent.action.VIEW -d "unfairenough-tv://preview?phase=PHASE" com.unfairenough.tvhost`
- Prints usage help on invalid input

## Files Changed

| File | Change |
|------|--------|
| `packages/game-logic/src/store/index.ts` | Add optional `preloadedState` param to `createStore()` |
| `apps/tv-host/App.tsx` | Add `'preview'` screen, preview detection logic, `Linking.getInitialURL()` |
| `apps/tv-host/app.config.ts` | Add `scheme: 'unfairenough-tv'` |
| `apps/tv-host/src/preview/previewData.ts` | **New** — mock state factory per phase |
| `apps/tv-host/src/preview/PreviewGameController.ts` | **New** — `IGameController` impl with preloaded store |
| `scripts/preview-screen.sh` | **New** — CLI entrypoint |

## Acceptance Criteria

- [x] `http://localhost:8082/?preview=QUESTION` renders QuestionScreen with mock question, countdown, and "2/4 answered"
- [x] `http://localhost:8082/?preview=RESULTS` renders ResultsScreen with correct answer highlighted, 4 player results, and rankings
- [x] `http://localhost:8082/?preview=GAME_OVER` renders GameOverScreen with position chart (5 rounds of history)
- [x] `http://localhost:8082/?preview=LOBBY` renders LobbyScreen with 4 players, room code "PREV", no crashes from missing server
- [x] `http://localhost:8082/?preview=COUNTDOWN` renders frozen countdown at 3
- [x] `http://localhost:8082/?preview=REVEALING` renders reveal animation
- [x] `http://localhost:8082/?preview=MEDIA_PREVIEW` renders media preview with placeholder
- [x] `./scripts/preview-screen.sh QUESTION` opens browser to correct URL
- [x] `./scripts/preview-screen.sh RESULTS android` sends correct ADB intent
- [x] Script prints usage on invalid phase
- [x] Preview mode is gated behind `__DEV__` — no-op in production builds
- [x] `adb shell am start -a android.intent.action.VIEW -d "unfairenough-tv://preview?phase=QUESTION" com.unfairenough.tvhost` opens QuestionScreen on Android TV

## Design Decisions

**Why not Storybook?** Hard to set up with Expo TV + react-native-tvos fork, and we don't need component isolation — we need full-screen visual testing with real context providers.

**Why `mode="hosted"` instead of a new `'preview'` mode?** Adding a third mode would require auditing every `mode === 'local'` / `mode === 'hosted'` check across all screens. With `mode="hosted"` and `serverUrl` left undefined, all network-fetching code paths are naturally skipped (LobbyScreen's fetch is guarded by `serverUrl` being truthy, bgMusic silently catches errors).

**Why preloaded state instead of dispatching actions?** The `VALID_TRANSITIONS` map enforces strict phase ordering (LOBBY → COUNTDOWN → QUESTION → ...). You cannot dispatch `showRoundResults()` from LOBBY. Preloaded state bypasses the reducers entirely.

**Why not interactive (buttons that work)?** Keeping it simple — `startGame`, `reset`, `configureGame` are no-ops. The goal is visual testing, not flow testing. Interactive preview can be added later if needed.

## References

- `apps/tv-host/App.tsx` — current navigation state machine
- `apps/tv-host/src/screens/GameScreen.tsx` — phase → screen routing
- `apps/tv-host/src/services/IGameController.ts` — controller interface
- `apps/tv-host/src/hooks/useGameController.ts` — hook that screens consume
- `packages/game-logic/src/slices/gameSlice.ts:22-30` — `VALID_TRANSITIONS` map
- `packages/game-logic/src/data/sampleQuestions.ts` — sample questions for mock data
- `apps/mobile/src/screens/GameScreen.tsx:48` — precedent for `URLSearchParams` usage
