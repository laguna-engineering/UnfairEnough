# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Unfair Enough! is a multiplayer quiz game. The TV app doubles as a central dashboard **and** the game server — you can run the entire game locally with a TV as the server and native mobile apps on phones. There's also a hosted mode where the Bun server manages game rooms and serves the TV web build; the hosted version works with both native and web mobile clients.

## Commands

```bash
# Development
yarn dev:server           # Bun server with hot reload (port 3000)
yarn dev:tv               # TV host app (sets EXPO_TV=1)
yarn dev:mobile           # Mobile app

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
```

## Architecture

**Monorepo** — Yarn 1 workspaces. Node >=24. Packages are consumed as TypeScript source (no build step).

### Apps

- **`apps/server/`** — Bun + Hono. Manages game rooms via WebSocket (`/ws?role=host|player&roomCode=XXXX`). Serves the TV host web build from `./public` as static files. This is the hosted-mode server.
- **`apps/tv-host/`** — Expo app using `react-native-tvos` fork. Builds for Apple TV, Android TV, and web. In local mode, uses `react-native-tcp-socket` to run a WebSocket server directly on the TV device. In hosted mode, connects to the Bun server as a host client. Landscape orientation.
- **`apps/mobile/`** — Standard Expo app (iOS, Android, web). Connects to the game server (local or hosted) as a player. Has QR scanning via `expo-camera` and React Navigation stack. Portrait orientation.

### Packages

- **`packages/ws-protocol/`** — Message types and validation for client↔server communication. Both apps and the server import this.
- **`packages/game-logic/`** — Redux Toolkit slices (`gameSlice`, `playersSlice`), scoring/ranking utils, sample question bank.
- **`packages/ui/`** — Shared components and theme ("Neon Sakura"). `expo-linear-gradient` is a peerDependency.
- **`packages/i18n/`** — i18next with English and Italian translations.
- **`packages/shared/`** — Common utilities.

### Game flow

Both apps use a `GameScreen` component that routes by game phase: `LOBBY → COUNTDOWN → QUESTION → REVEALING → RESULTS → GAME_OVER`.

WebSocket protocol: host creates room → players join with room code → server orchestrates phases, distributes questions, collects timestamped answers, calculates scores.

## Key constraints

- `EXPO_TV=1` must be set for all tv-host commands (Metro uses `.tv.ts` extensions).
- Gradient arrays in `packages/ui/src/theme/colors.ts` must use `as const` (LinearGradient `colors` prop requires tuple types).
- tv-host has pre-existing TS errors from `react-native-tcp-socket` (conflicting React Native types between tvOS fork and socket lib). These are known.
- `ScreenBackground` provides `flex: 1` — screen containers should not duplicate `flex: 1` or set `backgroundColor`.
- Path alias: `@unfairenough/*` → `packages/*/src`.
- React 19.1.0 is pinned globally via `resolutions`.
- Max 12 players per room.
