---
title: Add Background Music to TV App
type: feat
date: 2026-02-20
---

# Add Background Music to TV App

## Overview

Add background music playback to the TV host app. Music MP3 files live in a gitignored directory on the server. The TV app (hosted/web) discovers available tracks via an API endpoint and plays them in a continuous loop. If no music files are present, the app works normally with no music. Dead simple for anyone to add their own music: drop MP3 files in a folder.

## Proposed Solution

### Audio Format: MP3

| Format | tvOS | Android TV | Web (all browsers) | Verdict |
|--------|------|------------|---------------------|---------|
| MP3    | YES  | YES        | YES                 | **Best choice** |
| AAC/M4A| YES  | YES        | Firefox risk        | Good but not universal |
| OGG    | NO   | YES        | NO (Safari)         | Disqualified |

**Decision**: MP3. Universal cross-platform support, users already have MP3s or can convert easily.

### Library: `expo-audio`

`expo-av` is deprecated and will be removed in SDK 55. `expo-audio` is its replacement, explicitly supports tvOS, and has a cleaner API (`useAudioPlayer` hook manages player lifecycle automatically).

### Architecture

```
apps/server/music/                   <-- Users drop MP3 files here (gitignored)
apps/server/music/.gitkeep           <-- Keeps the directory in git
apps/server/src/index.ts             <-- Inline: GET /api/music + serveStatic('/music/*')
apps/tv-host/src/hooks/useBgMusic.ts <-- Single hook: fetch tracks, play, mute control
```

**Server side (inline in `index.ts`):**
- `GET /api/music` → scans `music/` directory, filters `.mp3` files, returns `{ tracks: ["track1.mp3", "track2.mp3"] }`
- `serveStatic('/music/*')` → Hono's built-in static middleware (prevents path traversal)
- If directory is empty or missing → returns `{ tracks: [] }`

**Client side (TV app):**
- A single `useBgMusic()` hook called in `GameScreen` — uses `useAudioPlayer` from expo-audio directly (no separate class or wrapper component needed)
- Fetches track list from server once on mount (hosted mode only)
- Plays tracks sequentially, advances on finish via `player.replace()`, loops after last track
- Default volume: ~25% (low enough for party conversation)
- On track load error: skip to next track (circuit breaker after 3 consecutive failures)
- If all tracks fail or list is empty: no music, no error
- **Local mode**: Hook detects `mode !== 'hosted'` and returns early — no music, no errors

### Mute Toggle

- A small mute/unmute icon button on `LobbyScreen` (only visible when `hasTracks` is true)
- Session-only preference (resets on app restart — no AsyncStorage complexity for v1)
- Accessible via TV remote focus system (existing `Pressable` + `focused` pattern)

## Technical Approach

### Phase 1: ffmpeg Conversion

Convert the user's OGG files to MP3:

```bash
mkdir -p apps/server/music
for f in ~/Desktop/Game\ Music\ Pack\ Vol.\ 3/*.ogg; do
  ffmpeg -i "$f" -codec:a libmp3lame -b:a 192k \
    "apps/server/music/$(basename "${f%.ogg}.mp3")"
done
```

### Phase 2: Server — Music API (inline in `index.ts`)

Add ~15 lines directly in `apps/server/src/index.ts`:
- `GET /api/music` — reads `music/` directory, filters `.mp3` files, returns JSON
- `app.use('/music/*', serveStatic({ root: './' }))` — serves files alongside existing `/admin/*`, `/tv/*`, `/mobile/*` static mounts

Using `serveStatic()` (not a custom handler) eliminates path traversal risk and matches existing patterns.

### Phase 3: Gitignore + Scaffold

**`.gitignore` addition:**
```
# Background music (user-provided)
apps/server/music/*
!apps/server/music/.gitkeep
```

### Phase 4: TV App — expo-audio + `useBgMusic` hook

**Install:**
```bash
yarn tv add expo-audio
```

**New file: `apps/tv-host/src/hooks/useBgMusic.ts`**

A single React hook that:
- Gets the server URL from `GameModeContext` (using existing `serverUrl.replace(/^wss?:\/\//, 'http://')` pattern from LobbyScreen)
- Returns early if `mode !== 'hosted'` (no music in local mode)
- Fetches track list once on mount via `GET /api/music`
- Uses `useAudioPlayer` from expo-audio (auto-managed lifecycle)
- Advances to next track on `didJustFinish` via `player.replace()`
- Circuit breaker: stops after 3 consecutive errors
- Handles web autoplay rejection gracefully (catches error, retries on next user interaction)
- Exposes `{ isMuted, toggleMute, hasTracks }` to the UI

### Phase 5: TV App — UI Integration

**`apps/tv-host/src/screens/GameScreen.tsx`:**
- Call `useBgMusic()` at the top of the component (GameScreen never unmounts, so the player persists across all phase transitions)
- Pass `{ isMuted, toggleMute, hasTracks }` as props to `LobbyScreen`

**`apps/tv-host/src/screens/LobbyScreen.tsx`:**
- Add a small mute/unmute icon button (speaker icon) in the top-right area
- Only visible when `hasTracks` is true
- Uses TV focus system: `(state as any).focused && styles.focused` pattern

### Phase 6: Prebuild

```bash
EXPO_TV=1 yarn prebuild:tv
```

Regenerate native projects to include `expo-audio` native modules.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No music files in directory | `GET /api/music` returns empty list, no music plays, app works fine |
| Corrupt MP3 file | Player error → skip to next track |
| All tracks fail (3 consecutive) | Music silently disabled for session via circuit breaker |
| Server music dir doesn't exist | `readdir` catch → return empty list |
| Non-MP3 files in directory | Filtered out by `.mp3` extension check |
| WebSocket reconnect | Music continues independently (HTTP-based, not WS-dependent) |
| Multiple games (Play Again) | Music continues playing (hook stays mounted in GameScreen) |
| Web autoplay policy | Catch rejection, retry on next user interaction |
| Local mode | Hook returns early, no music, no errors |
| Brief gap between tracks | ~200-500ms on LAN, acceptable for a party game |

## Acceptance Criteria

- [ ] OGG files converted to MP3 and placed in `apps/server/music/`
- [ ] Music files excluded from git via `.gitignore`
- [ ] Server exposes `GET /api/music` and serves static files via `serveStatic('/music/*')`
- [ ] TV app plays background music in hosted mode (web + native)
- [ ] Music loops continuously through all available tracks
- [ ] Music continues across phase transitions (LOBBY → QUESTION → RESULTS → etc.)
- [ ] Empty music directory = no music, no errors
- [ ] Mute toggle on lobby screen (session-only)
- [ ] Track load errors handled gracefully (skip + circuit breaker)
- [ ] App functions normally in local mode without music
- [ ] `yarn lint` passes

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/server/music/.gitkeep` | Create |
| `apps/server/music/*.mp3` | Create (converted from OGG, gitignored) |
| `apps/server/src/index.ts` | Modify — add `GET /api/music` + `serveStatic('/music/*')` inline |
| `apps/tv-host/package.json` | Modify — add `expo-audio` |
| `apps/tv-host/src/hooks/useBgMusic.ts` | Create — single hook (~60-80 lines) |
| `apps/tv-host/src/screens/GameScreen.tsx` | Modify — call `useBgMusic()`, pass mute controls to LobbyScreen |
| `apps/tv-host/src/screens/LobbyScreen.tsx` | Modify — add mute toggle button |
| `.gitignore` | Modify — exclude `apps/server/music/*` except `.gitkeep` |

## Deferred to v2

- MEDIA_PREVIEW audio ducking (no audio media UI exists yet)
- AsyncStorage mute persistence across app restarts
- Re-fetch track list between games
- Shuffle tracks on loop cycle
- Local mode music support

## References

- [expo-audio docs](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Apple TV supported formats](https://support.apple.com/en-us/102218)
- expo-av deprecation: SDK 55 removal planned
- Existing adaptive quiz engine plan mentions `expo-av` deferral: `docs/plans/2026-02-06-feat-adaptive-quiz-engine-plan.md`
