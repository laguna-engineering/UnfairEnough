# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Unfair Enough! is a multiplayer quiz game. The TV app doubles as a central dashboard **and** the game server — you can run the entire game locally with a TV as the server and native mobile apps on phones. There's also a hosted mode where the Bun server manages game rooms; the hosted version works with both native and web mobile clients.

## Commands

```bash
# Development
yarn dev:server           # Bun server with hot reload (port 3000, proxies /mobile/ to Metro)
yarn dev:tv               # TV host app (sets EXPO_TV=1)
yarn dev:mobile           # Mobile app (Metro on port 8081)

# Run specific workspace commands
yarn tv <cmd>             # e.g. yarn tv ios, yarn tv web
yarn mobile <cmd>         # e.g. yarn mobile ios, yarn mobile web

# Native prebuilds
yarn prebuild:tv          # Expo prebuild for TV (EXPO_TV=1)
yarn prebuild:mobile      # Expo prebuild for mobile

# Type checking
yarn server typecheck     # Server only (bun types)

# Linting & formatting (Biome)
yarn lint                 # Check lint + formatting
yarn lint:fix             # Auto-fix lint + formatting
yarn format               # Auto-fix formatting only

# E2E testing (Playwright)
yarn test:e2e             # Run all E2E tests (headless)
yarn test:e2e:ui          # Run with Playwright UI
yarn test:e2e --project="TV Host"        # TV only (1920x1080 viewport)
yarn test:e2e --project="Mobile Chrome"  # Player app only (Pixel 5 viewport)
# The screenshot specs write review artifacts to screenshots/ (gitignored).

# Releases — bump the launch-screen stamp (yy.WW.pp), commit it, publish an Android EAS update
yarn release mobile       # Bump patch, or reset to .0 in a new ISO week
yarn release tv
yarn release mobile tv    # Both, each with its own independent version
yarn release tv --set 26.35.0
yarn release mobile --dry-run     # Print what would happen
yarn release mobile --no-publish  # Bump + commit only
yarn release tv -- --branch preview   # Args after -- go to `eas update`
                                      # (updates are Android-only unless you pass --platform)
```

## Architecture

**Monorepo** — Yarn 1 workspaces. Node >=24. Packages are consumed as TypeScript source (no build step).

### Apps

- **`apps/server/`** — Bun + Hono. Manages game rooms via WebSocket (`/ws?role=host|player&roomCode=XXXX`). Serves three context roots: `/mobile/` (dev proxy to Metro or static build), `/tv/` (TV host web build from `./public`), `/admin/` (full content-management dashboard: question sets, questions, tags, meta sets, players, media/bundle upload, LLM export). Root `/` redirects to `/mobile/`. Also owns the account/auth system: `src/auth/` (session middleware, tokens, pending TV device-flow logins) plus `routes/auth.ts`.
- **`apps/tv-host/`** — Expo app using `react-native-tvos` fork. Builds for Apple TV, Android TV, and web. In local mode, uses `react-native-tcp-socket` to run a WebSocket server directly on the TV device. In hosted mode, connects to the Bun server as a host client. Landscape orientation.
- **`apps/mobile/`** — Standard Expo app (iOS, Android, web). Connects to the game server (local or hosted) as a player. Has QR scanning via `expo-camera` and React Navigation stack. Portrait orientation.

### Packages

- **`packages/ws-protocol/`** — Message types and validation for client↔server communication. Both apps and the server import this.
- **`packages/game-logic/`** — Redux Toolkit slices (`gameSlice`, `playersSlice`), scoring/ranking utils, sample question bank.
- **`packages/db/`** — SQLite schema, migrations, repositories, YAML question-set import. Used by both the server (`bun:sqlite`) and the TV host (`expo-sqlite`, via `adapter-expo.ts`).
- **`packages/ui/`** — Shared components and theme ("Neon Sakura"). `expo-linear-gradient` is a peerDependency.
- **`packages/i18n/`** — i18next with English and Italian translations.
- **`packages/shared/`** — Common utilities.

### Game flow

Both apps use a `GameScreen` component that routes by game phase: `LOBBY → COUNTDOWN → MEDIA_PREVIEW (only if the question has media) → QUESTION → REVEALING → RESULTS → GAME_OVER`.

WebSocket protocol: host creates room → players join with room code → server orchestrates phases, distributes questions, collects timestamped answers, calculates scores.

### Preview harness (web dev builds)

Both apps can boot straight into a screen with mock data, no server and no room —
this is what the screenshot and layout specs drive, and it's the fastest way to eyeball
a crowded-room layout by hand.

- TV (`localhost:8082`): `?preview=<PHASE>` where PHASE is one of `LOBBY, COUNTDOWN,
  MEDIA_PREVIEW, QUESTION, REVEALING, RESULTS, GAME_OVER`. Knobs: `players=1..50`,
  `type=multiple_choice|true_false|closest_wins|predict_room`, `answered=<n>`, `server=<host>`.
  Android TV takes the same params over `unfairenough-tv://preview?phase=...`.
- Mobile (`localhost:8081`): `?preview=<SCREEN>` where SCREEN is one of `SCAN, JOIN,
  PICK_PROFILE, WELCOME_BACK, RETURNING, WAITING, COUNTDOWN, MEDIA_PREVIEW, PLAY, RESULT,
  GAME_OVER, EMOJI_CATALOG`. Knobs: `players=3..50`, `type=...`, `answered=1`,
  `category=faces|animals|food|fun` (EMOJI_CATALOG only — one tab instead of all four).
- `EMOJI_CATALOG` is a review surface, not a game screen: it renders every avatar emoji
  labelled `FA07`, `AN23`, … so the set can be pruned by eye. `yarn test:e2e
  --project="Mobile Chrome" e2e/mobile/emoji-catalog.spec.ts` writes the sheets to
  `screenshots/mobile/emoji/`.
- The mock roster runs to 50 even though a room caps at 12 — layout assertions stop at the
  cap, the screenshot specs go past it to show where the screens give out.
- Both accept `?lang=en|it`. Without it the language comes from whichever `DEFAULT_LANG`
  built the bundle, so every e2e helper pins it — Italian's longer strings are also worth
  screenshotting.
- Mock data lives in `apps/*/src/preview/previewData.ts` and is deterministic (no `Date.now()`,
  no RNG) so the same URL always renders the same pixels. The join screen randomises the
  player's badge in the real app, so it takes an `initialAvatar` prop the preview pins —
  anything else you make random needs the same escape hatch.

## Key constraints

- `EXPO_TV=1` must be set for all tv-host commands (Metro uses `.tv.ts` extensions).
- Gradient arrays in `packages/ui/src/theme/colors.ts` must use `as const` (LinearGradient `colors` prop requires tuple types).
- tv-host has pre-existing TS errors from `react-native-tcp-socket` (conflicting React Native types between tvOS fork and socket lib). These are known.
- `ScreenBackground` provides `flex: 1` — screen containers should not duplicate `flex: 1` or set `backgroundColor`.
- **Avatar emoji and colours are single-sourced in `packages/shared/src/avatar.ts`.** The join
  screen offers them, the server validates JOIN against them, and the admin dashboard writes
  the same values — a fourth copy means a player picks a badge and silently gets a different
  one. `packages/ui`'s `playerColors` is a leftover from an older palette and is unused.
  Changing the emoji set is a layout question: re-run the catalog screenshots.
- Path alias: `@unfairenough/*` → `packages/*/src`.
- React 19.1.0 is pinned globally via `resolutions`.
- **Six players and up, the TV switches layouts.** The results and game-over
  screens have two shapes: up to five players everyone is named on the shared
  screen; from six up, `apps/tv-host/src/screens/scaled/` takes over and shows
  *shape* — vote crowds, proximity bands, a named top 12 and top 8 with the rest
  as bands — leaving each player's own result on their phone. The threshold and
  the cut-offs live in `scaled/scale.ts`; changing either is a layout question,
  so re-run the 50-player screenshots.
- Max 12 players per room by default, enforced only by the hosted server
  (`apps/server/src/room.ts`, `ROOM_FULL`). Override with the `MAX_PLAYERS` env var
  (`apps/server/.env` in dev, systemd unit in production). Local mode — the TV running its
  own server — enforces no cap at all. Raising it is a layout question first: check the
  50-player screenshots before you do.
- Each app's release stamp lives in its own `src/version.ts` (JS, so `eas update` ships it),
  never in `app.config.ts` — both apps use the fingerprint runtime version policy and the Expo
  config `version` field feeds that fingerprint.
