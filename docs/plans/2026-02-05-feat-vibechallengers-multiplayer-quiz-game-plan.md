---
title: "feat: Unfair Enough! Multiplayer Quiz Game - MVP"
type: feat
date: 2026-02-05
deepened: 2026-02-05
---

# Unfair Enough! - Multiplayer Quiz Game MVP

## Enhancement Summary

**Deepened on:** 2026-02-05
**Research agents used:** kieran-typescript-reviewer, performance-oracle, security-sentinel, julik-frontend-races-reviewer, architecture-strategist, code-simplicity-reviewer, pattern-recognition-specialist, best-practices-researcher (TV), framework-docs-researcher (WebSocket), frontend-design skill, norigin-spatial-navigation research

### Key Improvements
1. **Architecture Risk Identified**: nodejs-mobile-react-native has HIGH risk on TV platforms - alternatives provided
2. **Spatial Navigation**: Norigin spatial navigation for web TV dashboard (Tizen, WebOS, browser)
3. **Visual Design**: Complete "Neon Sakura" kawaii theme with component specifications
4. **Security Hardening**: crypto.randomUUID for IDs, 4-char room codes, input sanitization
5. **Server-Authoritative Timing**: All scoring based on server timestamps to prevent cheating

### Critical Considerations Discovered
- nodejs-mobile-react-native may not work on tvOS/Android TV - no documented success cases
- Clock drift between devices can cause unfair scoring - server must be authoritative
- TV platforms have limited memory (~512MB) - keep Redux state lean
- QR codes need 500-700px for 10-foot viewing distance scanning
- Norigin spatial navigation required for web TV platforms (Tizen, WebOS, browser-based TV apps)
- Native TV apps (Android TV, Apple TV) use TVFocusGuideView instead

---

## Overview

Build a multiplayer quiz game where players use their phones to answer questions displayed on a shared TV screen. The TV app acts as both the game host display and WebSocket server, while mobile/web clients connect to play.

**Theme:** Japanese-inspired friendly characters, cute colorful bots, vibrant and full of life.

**Target:** Step 1 MVP - Players join via QR code, enter names, answer timed 4-option questions, see results.

### Visual Design: "Neon Sakura" Theme

**Design Philosophy:**
- Japanese kawaii aesthetic meets modern neon cyberpunk
- Soft rounded shapes with glowing accents
- Friendly mascot characters that react to game events
- High contrast for TV viewing (10-foot UI)

**Color Palette:**
```
Primary Pink:    #FF6B9D (cherry blossom pink)
Secondary Cyan:  #4ECDC4 (electric teal)
Accent Yellow:   #FFE66D (golden spark)
Accent Purple:   #9B59B6 (twilight purple)
Dark Base:       #1a1a2e (deep indigo night)
Card Background: #16213e (navy blue)
Text Primary:    #FFFFFF
Text Secondary:  #E0E0E0
Success Green:   #00D9A5 (mint correct)
Error Red:       #FF6B6B (soft coral wrong)
```

**Typography:**
```
Headings: "Nunito" (rounded, friendly) - Bold 800
Body: "Nunito" (rounded, friendly) - Regular 400
Numbers/Timer: "Orbitron" (digital, futuristic) - Bold
Japanese Accent: "Kosugi Maru" (for mascot speech bubbles)
```

**Answer Button Layout (WWTBAM Style):**
```
┌─────────────────────────────────────┐
│  ┌─────────────┐  ┌─────────────┐  │
│  │  A: Option  │  │  B: Option  │  │
│  └─────────────┘  └─────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  │
│  │  C: Option  │  │  D: Option  │  │
│  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────┘

Button States:
- Default: Card background with subtle glow
- Focused: Neon pink border + scale(1.05)
- Selected: Pulsing pink glow, checkmark icon
- Correct: Mint green glow + confetti particles
- Wrong: Soft coral fade + gentle shake
```

**Mascot Characters:**
- **Vibe-chan**: Pink sakura spirit, appears for correct answers
- **Quiz-kun**: Blue tanuki with headphones, hosts the game
- **Spark-san**: Yellow electric creature, celebrates wins

**Animation Principles:**
- Smooth 300ms transitions for all state changes
- Bounce easing for mascot reactions
- Particle effects for celebrations (keep lightweight for TV)
- Timer uses circular progress with gradient stroke

## Problem Statement / Motivation

Create an engaging party game experience where:
- Friends can play together using devices they already have
- No account creation required for players
- Works on local network without internet dependency
- Supports both TV apps (Android TV, Apple TV) and web-hosted games

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Monorepo                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   apps/tv-host  │  │ apps/mobile     │  │  packages/   │ │
│  │  (Android TV /  │  │ (iOS/Android/   │  │  - shared    │ │
│  │   Apple TV /    │  │  Web client)    │  │  - game-logic│ │
│  │   Web host)     │  │                 │  │  - i18n      │ │
│  │                 │  │                 │  │  - ws-proto  │ │
│  │  WebSocket      │  │  WebSocket      │  │  - ui        │ │
│  │  Server         │◄─┤  Client         │  │              │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Expo SDK | 54 |
| React Native TV | react-native-tvos | 0.81-stable |
| State Management | Redux Toolkit + RTK Query | 2.x |
| WebSocket Server | nodejs-mobile-react-native | 0.9.x |
| Spatial Navigation (Web TV) | @noriginmedia/norigin-spatial-navigation | 2.x |
| i18n | i18next + expo-localization | 24.x / 16.x |
| QR Code | react-native-qrcode-svg | 6.x |
| QR Scanner | expo-camera | 16.x |
| Monorepo | Yarn Workspaces | 1.x |

### Research Insights: Technology Choices

**Norigin Spatial Navigation for Web TV Platforms:**
- **Essential** for D-pad/remote control navigation - without it, users can't navigate with TV remotes!
- Supports Samsung Tizen, LG WebOS, Hisense Vidaa, and any browser-based TV app
- React Hooks-based library with `useFocusable`, `FocusContext`, `setFocus`
- For native React Native TV apps (Android TV, Apple TV), use `TVFocusGuideView` instead
- Minimal dependencies, TypeScript support

```typescript
// Example: Norigin spatial navigation setup for web TV dashboard
import { init, useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';

// Initialize at app startup
init({ debug: false, visualDebug: false });

// In focusable components
const FocusableButton = ({ children, onPress }) => {
  const { ref, focused, focusSelf } = useFocusable({
    onEnterPress: onPress,
    onFocus: () => console.log('Button focused'),
  });

  return (
    <button
      ref={ref}
      style={{ backgroundColor: focused ? '#FF6B9D' : 'transparent' }}
    >
      {children}
    </button>
  );
};

// Wrap related focusable elements in FocusContext
const Menu = () => {
  const { ref, focusKey } = useFocusable();
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>
        <FocusableButton>Play</FocusableButton>
        <FocusableButton>Settings</FocusableButton>
      </div>
    </FocusContext.Provider>
  );
};
```

## Technical Approach

### Phase 1: Monorepo Setup & Infrastructure

#### 1.1 Restructure to Monorepo

Move existing TV app setup to `apps/tv-host/` and create workspace structure:

```
Unfair Enough!/
├── package.json                 # Root workspace config
├── yarn.lock
├── tsconfig.json               # Base TypeScript config
├── apps/
│   ├── tv-host/                # TV Host app (Android TV / Apple TV / Web)
│   │   ├── app.json
│   │   ├── package.json
│   │   ├── metro.config.js
│   │   ├── App.tsx
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── android/            # Generated (prebuild)
│   │   └── ios/                # Generated (prebuild)
│   └── mobile/                 # Mobile client app (iOS / Android / Web)
│       ├── app.json
│       ├── package.json
│       ├── metro.config.js
│       ├── App.tsx
│       ├── src/
│       │   ├── screens/
│       │   └── components/
│       ├── android/            # Generated (prebuild)
│       └── ios/                # Generated (prebuild)
├── packages/
│   ├── shared/                 # Shared utilities and types
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts
│   ├── game-logic/             # Game state, Redux store
│   │   ├── package.json
│   │   └── src/
│   │       ├── store/
│   │       ├── slices/
│   │       └── types/
│   ├── i18n/                   # Translations
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       └── locales/
│   │           ├── en/
│   │           └── it/
│   ├── ws-protocol/            # WebSocket message types & handlers
│   │   ├── package.json
│   │   └── src/
│   │       ├── messages.ts
│   │       └── index.ts
│   └── ui/                     # Shared UI components
│       ├── package.json
│       └── src/
│           ├── components/
│           └── theme/
└── docs/
    └── plans/
```

#### 1.2 Root package.json

```json
{
  "name": "unfairenough-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "tv": "yarn workspace @unfairenough/tv-host",
    "mobile": "yarn workspace @unfairenough/mobile",
    "dev:tv": "EXPO_TV=1 yarn workspace @unfairenough/tv-host start",
    "dev:mobile": "yarn workspace @unfairenough/mobile start",
    "prebuild:tv": "EXPO_TV=1 yarn workspace @unfairenough/tv-host expo prebuild --clean",
    "prebuild:mobile": "yarn workspace @unfairenough/mobile expo prebuild --clean"
  },
  "resolutions": {
    "react": "19.1.0",
    "react-native": "npm:react-native-tvos@0.81-stable"
  }
}
```

### Phase 2: WebSocket Protocol & Server

#### 2.1 Message Protocol (packages/ws-protocol)

### Research Insights: Protocol Design

**Server-Authoritative Timestamps:**
- NEVER trust client timestamps for scoring
- Server records `receivedAt` timestamp when answer arrives
- Calculate response time as `receivedAt - questionSentAt`

```typescript
// packages/ws-protocol/src/messages.ts

// Client -> Server messages
export type ClientMessage =
  | { type: 'JOIN'; payload: { name: string; roomCode?: string } }
  | { type: 'ANSWER'; payload: { questionId: string; answer: 'A' | 'B' | 'C' | 'D' } }
  | { type: 'PING' };

// Server -> Client messages
export type ServerMessage =
  | { type: 'WELCOME'; payload: { playerId: string; playerColor: string; roomCode: string } }
  | { type: 'PLAYER_JOINED'; payload: { playerId: string; name: string; color: string } }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'GAME_STARTING'; payload: { countdown: number } }
  | { type: 'QUESTION'; payload: Question & { serverTimestamp: number } }
  | { type: 'TICK'; payload: { remaining: number } }
  | { type: 'ANSWER_ACK'; payload: { questionId: string; serverReceivedAt: number } }
  | { type: 'ROUND_END'; payload: RoundResult }
  | { type: 'GAME_OVER'; payload: GameResult }
  | { type: 'PONG' }
  | { type: 'ERROR'; payload: { code: string; message: string } };

export interface Question {
  id: string;
  text: string;
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[];
  timeLimit: number;  // seconds (default 10)
  questionNumber: number;
  totalQuestions: number;
}

export interface RoundResult {
  questionId: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  playerResults: PlayerResult[];
}

export interface PlayerResult {
  playerId: string;
  name: string;
  answer: 'A' | 'B' | 'C' | 'D' | null;
  isCorrect: boolean;
  responseTimeMs: number | null;  // Server-calculated from serverTimestamp
  pointsEarned: number;
  totalScore: number;
}

export interface GameResult {
  rankings: { playerId: string; name: string; score: number; rank: number }[];
  winner: { playerId: string; name: string; score: number };
}

// Simple validation helper for WebSocket boundary
export function parseClientMessage(data: unknown): ClientMessage {
  const parsed = JSON.parse(String(data));
  // Basic validation - sanitize name input
  if (parsed.type === 'JOIN' && parsed.payload?.name) {
    parsed.payload.name = String(parsed.payload.name).trim().slice(0, 20).replace(/[<>]/g, '');
  }
  return parsed as ClientMessage;
}
```
```

#### 2.2 WebSocket Server (apps/tv-host)

Using `nodejs-mobile-react-native` to embed Node.js runtime:

```typescript
// apps/tv-host/nodejs-assets/nodejs-project/main.js
const rn_bridge = require('rn-bridge');
const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

const players = new Map();  // playerId -> { ws, name, color, score }
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
let colorIndex = 0;

wss.on('connection', (ws) => {
  const playerId = generateId();
  const color = COLORS[colorIndex++ % COLORS.length];

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    handleMessage(ws, playerId, color, message);
  });

  ws.on('close', () => {
    if (players.has(playerId)) {
      players.delete(playerId);
      broadcast({ type: 'PLAYER_LEFT', payload: { playerId } });
      rn_bridge.channel.send(JSON.stringify({ type: 'PLAYER_LEFT', playerId }));
    }
  });
});

function handleMessage(ws, playerId, color, message) {
  switch (message.type) {
    case 'JOIN':
      const name = sanitizeName(message.payload.name);
      players.set(playerId, { ws, name, color, score: 0 });

      // Send welcome to joining player
      ws.send(JSON.stringify({
        type: 'WELCOME',
        payload: { playerId, playerColor: color }
      }));

      // Broadcast to all
      broadcast({
        type: 'PLAYER_JOINED',
        payload: { playerId, name, color }
      });

      // Notify React Native
      rn_bridge.channel.send(JSON.stringify({
        type: 'PLAYER_JOINED',
        playerId, name, color
      }));
      break;

    case 'ANSWER':
      rn_bridge.channel.send(JSON.stringify({
        type: 'ANSWER',
        playerId,
        ...message.payload
      }));

      // Acknowledge to player
      ws.send(JSON.stringify({
        type: 'ANSWER_ACK',
        payload: { questionId: message.payload.questionId }
      }));
      break;

    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' }));
      break;
  }
}

// Receive messages from React Native to broadcast
rn_bridge.channel.on('message', (msg) => {
  const data = JSON.parse(msg);
  broadcast(data);
});

function broadcast(message) {
  const data = JSON.stringify(message);
  players.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// Use crypto.randomUUID for secure player IDs (not Math.random)
function generatePlayerId() {
  return crypto.randomUUID();
}

// Generate 4-character room code for manual entry
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0/O, 1/I/L)
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sanitizeName(name) {
  return name.trim().slice(0, 20).replace(/[<>]/g, '');
}

// Server-side timestamp for fair scoring
let serverSeq = 0;
function broadcast(message) {
  const data = JSON.stringify({ ...message, seq: ++serverSeq });
  players.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

rn_bridge.channel.send(JSON.stringify({ type: 'SERVER_READY', port: PORT }));
```

### Research Insights: WebSocket Server

**Security Hardening:**
- Use `crypto.randomUUID()` instead of `Math.random()` for player IDs
- Generate 4-char room codes using unambiguous characters (no 0/O/1/I/L confusion)
- Sanitize all player input to prevent XSS (name field)
- Add rate limiting: max 10 messages/second per client

**Server-Authoritative Timing:**
- Record `serverReceivedAt = Date.now()` when answer arrives
- Calculate response time: `responseTimeMs = serverReceivedAt - questionSentAt`
- Never trust client-provided timestamps for scoring

**Reconnection Handling:**
- Store player session with 30-second grace period on disconnect
- On reconnect, player provides playerId from localStorage
- Server validates and restores session if within grace period

### Phase 3: Game Logic (packages/game-logic)

#### 3.1 Redux Store Configuration

```typescript
// packages/game-logic/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../slices/gameSlice';
import playersReducer from '../slices/playersSlice';

export const createStore = () => configureStore({
  reducer: {
    game: gameReducer,
    players: playersReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['game/setWebSocket'],
        ignoredPaths: ['game.ws'],
      },
    }),
});

export type RootState = ReturnType<ReturnType<typeof createStore>['getState']>;
export type AppDispatch = ReturnType<typeof createStore>['dispatch'];
```

#### 3.2 Game Slice

```typescript
// packages/game-logic/src/slices/gameSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Question, PlayerResult } from '@unfairenough/ws-protocol';

// State machine pattern for game phases - prevents invalid transitions
export type GamePhase =
  | 'LOBBY'       // -> COUNTDOWN (when host starts)
  | 'COUNTDOWN'   // -> QUESTION (when countdown reaches 0)
  | 'QUESTION'    // -> REVEALING (when timer expires or all answered)
  | 'REVEALING'   // -> RESULTS (after reveal animation)
  | 'RESULTS'     // -> QUESTION (next question) or GAME_OVER (last question)
  | 'GAME_OVER';  // -> LOBBY (when host restarts)

// Valid phase transitions - enforced at state update time
const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  LOBBY: ['COUNTDOWN'],
  COUNTDOWN: ['QUESTION'],
  QUESTION: ['REVEALING'],
  REVEALING: ['RESULTS'],
  RESULTS: ['QUESTION', 'GAME_OVER'],
  GAME_OVER: ['LOBBY'],
};

function canTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

interface Answer {
  playerId: string;
  answer: string;
  timestamp: number;
}

interface GameState {
  phase: GamePhase;
  currentQuestion: Question | null;
  questionStartTime: number | null;
  countdown: number;
  answers: Record<string, Answer>;
  roundResults: PlayerResult[];
  config: {
    questionTimeLimit: number;
    totalQuestions: number;
  };
}

const initialState: GameState = {
  phase: 'LOBBY',
  currentQuestion: null,
  questionStartTime: null,
  countdown: 0,
  answers: {},
  roundResults: [],
  config: {
    questionTimeLimit: 10,
    totalQuestions: 10,
  },
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    startGameCountdown(state) {
      state.phase = 'COUNTDOWN';
      state.countdown = 3;
    },

    tickGameCountdown(state) {
      state.countdown = Math.max(0, state.countdown - 1);
    },

    showQuestion(state, action: PayloadAction<Question>) {
      state.phase = 'QUESTION';
      state.currentQuestion = action.payload;
      state.questionStartTime = Date.now();
      state.countdown = action.payload.timeLimit;
      state.answers = {};
    },

    tickQuestionTimer(state) {
      state.countdown = Math.max(0, state.countdown - 1);
    },

    receiveAnswer(state, action: PayloadAction<Answer>) {
      const { playerId, answer, timestamp } = action.payload;
      // Only accept first answer from each player
      if (!state.answers[playerId] && state.phase === 'QUESTION') {
        state.answers[playerId] = { playerId, answer, timestamp };
      }
    },

    startRevealing(state) {
      state.phase = 'REVEALING';
    },

    showRoundResults(state, action: PayloadAction<PlayerResult[]>) {
      state.phase = 'RESULTS';
      state.roundResults = action.payload;
    },

    endGame(state) {
      state.phase = 'GAME_OVER';
    },

    resetGame(state) {
      return { ...initialState, config: state.config };
    },

    updateConfig(state, action: PayloadAction<Partial<GameState['config']>>) {
      state.config = { ...state.config, ...action.payload };
    },
  },
});

export const {
  startGameCountdown,
  tickGameCountdown,
  showQuestion,
  tickQuestionTimer,
  receiveAnswer,
  startRevealing,
  showRoundResults,
  endGame,
  resetGame,
  updateConfig,
} = gameSlice.actions;

export default gameSlice.reducer;
```

#### 3.3 Players Slice with Entity Adapter

```typescript
// packages/game-logic/src/slices/playersSlice.ts
import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';

export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  isConnected: boolean;
}

const playersAdapter = createEntityAdapter<Player>({
  selectId: (player) => player.id,
  sortComparer: (a, b) => b.score - a.score,
});

const playersSlice = createSlice({
  name: 'players',
  initialState: playersAdapter.getInitialState(),
  reducers: {
    addPlayer: playersAdapter.addOne,
    removePlayer: playersAdapter.removeOne,
    updateScore(state, action: PayloadAction<{ id: string; score: number }>) {
      playersAdapter.updateOne(state, {
        id: action.payload.id,
        changes: { score: action.payload.score },
      });
    },
    setPlayerDisconnected(state, action: PayloadAction<string>) {
      playersAdapter.updateOne(state, {
        id: action.payload,
        changes: { isConnected: false },
      });
    },
    clearPlayers: playersAdapter.removeAll,
  },
});

export const {
  addPlayer,
  removePlayer,
  updateScore,
  setPlayerDisconnected,
  clearPlayers,
} = playersSlice.actions;

export const playersSelectors = playersAdapter.getSelectors();
export default playersSlice.reducer;
```

#### 3.4 Scoring Logic

```typescript
// packages/game-logic/src/utils/scoring.ts

const BASE_POINTS = 100;
const MAX_TIME_BONUS = 900;  // Total max = 1000 points

export function calculateScore(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimit: number
): number {
  if (!isCorrect) return 0;

  const timeLimitMs = timeLimit * 1000;
  const timeRatio = Math.max(0, 1 - (responseTimeMs / timeLimitMs));
  const timeBonus = Math.floor(MAX_TIME_BONUS * timeRatio);

  return BASE_POINTS + timeBonus;
}

export function rankPlayers(
  players: { id: string; name: string; score: number }[]
): { id: string; name: string; score: number; rank: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  let rank = 1;
  return sorted.map((player, index) => {
    if (index > 0 && player.score < sorted[index - 1].score) {
      rank = index + 1;
    }
    return { ...player, rank };
  });
}
```

### Phase 4: Internationalization (packages/i18n)

#### 4.1 i18n Configuration

```typescript
// packages/i18n/src/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en/translation.json';
import it from './locales/it/translation.json';

const resources = {
  en: { translation: en },
  it: { translation: it },
};

const getDeviceLanguage = () => {
  const locale = Localization.getLocales()[0];
  const langCode = locale?.languageCode ?? 'en';
  return langCode in resources ? langCode : 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
export const changeLanguage = (lng: string) => i18n.changeLanguage(lng);
```

#### 4.2 English Translations

```json
// packages/i18n/src/locales/en/translation.json
{
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "retry": "Retry",
    "back": "Back",
    "start": "Start",
    "cancel": "Cancel"
  },
  "lobby": {
    "title": "Unfair Enough!",
    "scanToJoin": "Scan to Join",
    "orEnterCode": "Or enter code: {{code}}",
    "waitingForPlayers": "Waiting for players...",
    "playersJoined": "{{count}} player ready",
    "playersJoined_other": "{{count}} players ready",
    "startGame": "Start Game",
    "minPlayersNeeded": "Need at least {{min}} player to start",
    "settings": "Settings"
  },
  "join": {
    "scanQR": "Scan QR Code",
    "enterName": "Enter your name",
    "namePlaceholder": "Your name",
    "join": "Join Game",
    "connecting": "Connecting...",
    "waitingForHost": "Waiting for host to start...",
    "youAreIn": "You're in!"
  },
  "game": {
    "getReady": "Get Ready!",
    "question": "Question {{current}} of {{total}}",
    "timeRemaining": "{{seconds}}s",
    "tapToSelect": "Tap to select",
    "tapToConfirm": "Tap again to confirm",
    "answerSubmitted": "Answer submitted!",
    "letsSeee": "Let's see...",
    "correct": "Correct!",
    "incorrect": "Incorrect",
    "noAnswer": "No answer",
    "points": "+{{points}} points",
    "yourScore": "Your score: {{score}}",
    "fastestAnswer": "Fastest: {{name}} ({{time}}s)"
  },
  "results": {
    "gameOver": "Game Over!",
    "winner": "Winner",
    "finalScores": "Final Scores",
    "yourPosition": "You finished #{{position}}",
    "playAgain": "Play Again",
    "backToLobby": "Back to Lobby"
  }
}
```

#### 4.3 Italian Translations

```json
// packages/i18n/src/locales/it/translation.json
{
  "common": {
    "loading": "Caricamento...",
    "error": "Si \u00e8 verificato un errore",
    "retry": "Riprova",
    "back": "Indietro",
    "start": "Inizia",
    "cancel": "Annulla"
  },
  "lobby": {
    "title": "Unfair Enough!",
    "scanToJoin": "Scansiona per unirti",
    "orEnterCode": "Oppure inserisci il codice: {{code}}",
    "waitingForPlayers": "In attesa di giocatori...",
    "playersJoined": "{{count}} giocatore pronto",
    "playersJoined_other": "{{count}} giocatori pronti",
    "startGame": "Inizia Partita",
    "minPlayersNeeded": "Servono almeno {{min}} giocatori per iniziare",
    "settings": "Impostazioni"
  },
  "join": {
    "scanQR": "Scansiona Codice QR",
    "enterName": "Inserisci il tuo nome",
    "namePlaceholder": "Il tuo nome",
    "join": "Unisciti",
    "connecting": "Connessione...",
    "waitingForHost": "In attesa che l'host inizi...",
    "youAreIn": "Sei dentro!"
  },
  "game": {
    "getReady": "Preparati!",
    "question": "Domanda {{current}} di {{total}}",
    "timeRemaining": "{{seconds}}s",
    "tapToSelect": "Tocca per selezionare",
    "tapToConfirm": "Tocca di nuovo per confermare",
    "answerSubmitted": "Risposta inviata!",
    "letsSee": "Vediamo...",
    "correct": "Corretto!",
    "incorrect": "Sbagliato",
    "noAnswer": "Nessuna risposta",
    "points": "+{{points}} punti",
    "yourScore": "Punteggio: {{score}}",
    "fastestAnswer": "Pi\u00f9 veloce: {{name}} ({{time}}s)"
  },
  "results": {
    "gameOver": "Fine Partita!",
    "winner": "Vincitore",
    "finalScores": "Punteggi Finali",
    "yourPosition": "Sei arrivato #{{position}}",
    "playAgain": "Gioca Ancora",
    "backToLobby": "Torna alla Lobby"
  }
}
```

### Phase 5: TV Host App (apps/tv-host)

#### 5.1 App Structure

```
apps/tv-host/
├── app.json
├── package.json
├── metro.config.js
├── App.tsx
├── src/
│   ├── screens/
│   │   ├── LobbyScreen.tsx
│   │   ├── GameScreen.tsx
│   │   ├── QuestionScreen.tsx
│   │   ├── RevealScreen.tsx
│   │   └── ResultsScreen.tsx
│   ├── components/
│   │   ├── QRCodeDisplay.tsx
│   │   ├── PlayerList.tsx
│   │   ├── QuestionCard.tsx
│   │   ├── AnswerOption.tsx
│   │   ├── Timer.tsx
│   │   ├── Leaderboard.tsx
│   │   └── FocusableButton.tsx
│   ├── services/
│   │   ├── WebSocketServer.ts
│   │   └── GameController.ts
│   └── hooks/
│       ├── useGameFlow.ts
│       └── useTVNavigation.ts
└── nodejs-assets/
    └── nodejs-project/
        ├── main.js
        └── package.json
```

#### 5.2 Key Screens

**LobbyScreen.tsx** - Displays QR code, connected players, Start button
**GameScreen.tsx** - Container managing game flow states
**QuestionScreen.tsx** - Shows question with 4 options and timer
**RevealScreen.tsx** - "Let's see..." animation then shows correct answer
**ResultsScreen.tsx** - Shows who got it right, rankings

### Research Insights: TV Host App

**Web Dashboard with Norigin Spatial Navigation (NEW hooks-based library):**

For the web-hosted TV dashboard, use `@noriginmedia/norigin-spatial-navigation` (v2.x+, hooks-based). Do NOT use the deprecated `@noriginmedia/react-spatial-navigation` (HOC-based).

```typescript
// apps/tv-host/src/web/navigation.ts
import {
  init,
  useFocusable,
  FocusContext,
  setFocus,
  getCurrentFocusKey,
} from '@noriginmedia/norigin-spatial-navigation';

// Initialize ONCE at app startup
init({
  debug: process.env.NODE_ENV === 'development',
  visualDebug: false, // Set true to see focus boundaries during dev
  distanceCalculationMethod: 'center', // 'center' | 'edge' | 'corners'
});

// apps/tv-host/src/components/FocusableButton.tsx
interface FocusableButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  focusKey?: string;
  autoFocus?: boolean;
}

export const FocusableButton: React.FC<FocusableButtonProps> = ({
  children,
  onPress,
  focusKey,
  autoFocus = false,
}) => {
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
    onEnterPress: onPress,
    onArrowPress: (direction) => {
      // Return true to allow default navigation, false to prevent
      return true;
    },
  });

  // Auto-focus on mount if specified
  useEffect(() => {
    if (autoFocus) {
      focusSelf();
    }
  }, [autoFocus, focusSelf]);

  return (
    <button
      ref={ref}
      className={`btn ${focused ? 'btn-focused' : ''}`}
    >
      {children}
    </button>
  );
};

// apps/tv-host/src/screens/LobbyScreen.tsx
export const LobbyScreen: React.FC = () => {
  const { ref, focusKey } = useFocusable({
    focusable: false, // Container not focusable, children are
    trackChildren: true,
    saveLastFocusedChild: true,
  });

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="lobby-container">
        <QRCodeDisplay size={600} />
        <PlayerList />
        <div className="lobby-actions">
          <FocusableButton
            focusKey="START_GAME"
            onPress={handleStartGame}
            autoFocus
          >
            {t('lobby.startGame')}
          </FocusableButton>
          <FocusableButton
            focusKey="SETTINGS"
            onPress={handleOpenSettings}
          >
            {t('lobby.settings')}
          </FocusableButton>
        </div>
      </div>
    </FocusContext.Provider>
  );
};

// Programmatic focus control
function handleGameStart() {
  // Focus the first answer option when question appears
  setFocus('ANSWER_A');
}
```

**TV Platform-Specific Considerations:**

```typescript
// apps/tv-host/src/hooks/useTVPlatform.ts
import { Platform, TVFocusGuideView } from 'react-native';

export const useTVPlatform = () => {
  const isTV = Platform.isTV;
  const isAndroidTV = Platform.OS === 'android' && Platform.isTV;
  const isAppleTV = Platform.OS === 'ios' && Platform.isTV;
  const isWebTV = Platform.OS === 'web'; // Web-hosted dashboard

  return {
    isTV,
    isAndroidTV,
    isAppleTV,
    isWebTV,
    // Use Norigin for web, TVFocusGuideView for native TV
    NavigationProvider: isWebTV ? NoriginFocusProvider : TVFocusGuideView,
  };
};
```

**QR Code Display (10-foot UI):**

```typescript
// apps/tv-host/src/components/QRCodeDisplay.tsx
import QRCode from 'react-native-qrcode-svg';

interface QRCodeDisplayProps {
  wsUrl: string;
  roomCode: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ wsUrl, roomCode }) => {
  // 600-700px for scanning from 10-foot distance
  const QR_SIZE = 600;

  return (
    <View style={styles.container}>
      <QRCode
        value={wsUrl}
        size={QR_SIZE}
        backgroundColor="white"
        color="#1a1a2e"
        logo={require('../assets/logo.png')}
        logoSize={QR_SIZE * 0.15}
        logoBackgroundColor="white"
      />
      <Text style={styles.roomCode}>
        {t('lobby.orEnterCode', { code: roomCode })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 40,
  },
  roomCode: {
    marginTop: 24,
    fontSize: 48, // Large for 10-foot viewing
    fontFamily: 'Nunito-Bold',
    color: '#FF6B9D',
    letterSpacing: 8,
  },
});
```

**Memory Optimization for TV Platforms:**

```typescript
// TV platforms have limited memory (~512MB)
// Minimize Redux state, avoid storing large objects

// BAD: Storing all historical data
const gameSlice = createSlice({
  name: 'game',
  initialState: {
    allQuestions: [], // Don't store all questions
    allAnswers: [],   // Don't store all historical answers
  },
});

// GOOD: Only store current state
const gameSlice = createSlice({
  name: 'game',
  initialState: {
    currentQuestion: null,
    currentAnswers: {},  // Clear after each round
    scores: {},          // Just current scores, not history
  },
});
```

### Phase 6: Mobile Client App (apps/mobile)

#### 6.1 App Structure

```
apps/mobile/
├── app.json
├── package.json
├── metro.config.js
├── App.tsx
├── src/
│   ├── screens/
│   │   ├── ScanScreen.tsx
│   │   ├── JoinScreen.tsx
│   │   ├── WaitingScreen.tsx
│   │   ├── PlayScreen.tsx
│   │   └── PersonalResultsScreen.tsx
│   ├── components/
│   │   ├── QRScanner.tsx
│   │   ├── NameInput.tsx
│   │   ├── AnswerButton.tsx
│   │   ├── TimerBar.tsx
│   │   └── ScoreCard.tsx
│   ├── services/
│   │   └── WebSocketClient.ts
│   └── hooks/
│       ├── useWebSocket.ts
│       └── useGameState.ts
```

#### 6.2 Key Screens

**ScanScreen.tsx** - Camera QR scanner + manual code entry
**JoinScreen.tsx** - Name entry form
**WaitingScreen.tsx** - "Waiting for host to start..."
**PlayScreen.tsx** - Question with 4 answer buttons (WWTBAM style)
**PersonalResultsScreen.tsx** - Personal score and position

### Research Insights: Mobile Client

**Race Condition Prevention:**

```typescript
// apps/mobile/src/hooks/useWebSocket.ts
import { useRef, useCallback } from 'react';

export const useWebSocket = (url: string) => {
  const wsRef = useRef<WebSocket | null>(null);
  const lastServerSeq = useRef<number>(0);
  const pendingAnswers = useRef<Map<string, { answer: string; sentAt: number }>>(new Map());

  const sendAnswer = useCallback((questionId: string, answer: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Optimistic UI: show selection immediately
    pendingAnswers.current.set(questionId, { answer, sentAt: Date.now() });

    ws.send(JSON.stringify({
      type: 'ANSWER',
      seq: Date.now(), // Client seq for dedup
      payload: { questionId, answer },
    }));
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    const message = JSON.parse(event.data);

    // Reject out-of-order messages
    if (message.seq <= lastServerSeq.current) {
      console.warn('Out of order message, ignoring:', message.seq);
      return;
    }
    lastServerSeq.current = message.seq;

    switch (message.type) {
      case 'ANSWER_ACK':
        // Server confirmed our answer - reconcile optimistic state
        pendingAnswers.current.delete(message.payload.questionId);
        break;

      case 'QUESTION':
        // New question - clear any stale pending answers
        pendingAnswers.current.clear();
        break;
    }
  }, []);

  return { sendAnswer, lastServerSeq };
};
```

**Optimistic UI with Server Reconciliation:**

```typescript
// apps/mobile/src/screens/PlayScreen.tsx
const PlayScreen: React.FC = () => {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confirmedAnswer, setConfirmedAnswer] = useState<string | null>(null);
  const [serverAcked, setServerAcked] = useState(false);

  const handleAnswerTap = (answer: string) => {
    if (confirmedAnswer) return; // Already submitted

    if (selectedAnswer === answer) {
      // Second tap = confirm
      setConfirmedAnswer(answer);
      sendAnswer(currentQuestion.id, answer);
      // Show optimistic "Submitted!" state
    } else {
      // First tap = select
      setSelectedAnswer(answer);
    }
  };

  // Reconcile when server ACKs
  useEffect(() => {
    if (serverAckedQuestionId === currentQuestion?.id) {
      setServerAcked(true);
    }
  }, [serverAckedQuestionId, currentQuestion?.id]);

  return (
    <View>
      {confirmedAnswer && !serverAcked && (
        <Text style={styles.submitting}>Submitting...</Text>
      )}
      {serverAcked && (
        <Text style={styles.submitted}>✓ Answer received!</Text>
      )}
    </View>
  );
};
```

**Reconnection Strategy:**

```typescript
// apps/mobile/src/services/WebSocketClient.ts
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private playerId: string | null = null;

  connect(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // If reconnecting, send stored playerId
      if (this.playerId) {
        this.ws?.send(JSON.stringify({
          type: 'RECONNECT',
          payload: { playerId: this.playerId },
        }));
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect(url);
    };
  }

  private scheduleReconnect(url: string) {
    const delay = RECONNECT_DELAYS[
      Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ];
    this.reconnectAttempt++;

    setTimeout(() => this.connect(url), delay);
  }
}
```

### Phase 7: Sample Questions

Bundle sample questions for MVP:

```typescript
// packages/game-logic/src/data/sampleQuestions.ts
export const sampleQuestions = [
  {
    id: '1',
    text: 'What is the capital of Japan?',
    options: [
      { key: 'A', text: 'Kyoto' },
      { key: 'B', text: 'Osaka' },
      { key: 'C', text: 'Tokyo' },
      { key: 'D', text: 'Nagoya' },
    ],
    correctAnswer: 'C',
  },
  {
    id: '2',
    text: 'Which planet is known as the Red Planet?',
    options: [
      { key: 'A', text: 'Venus' },
      { key: 'B', text: 'Mars' },
      { key: 'C', text: 'Jupiter' },
      { key: 'D', text: 'Saturn' },
    ],
    correctAnswer: 'B',
  },
  // ... more questions
];
```

## Acceptance Criteria

### Functional Requirements

- [ ] **Monorepo Setup**
  - [ ] Root workspace with apps/ and packages/ structure
  - [ ] Shared packages importable from both apps
  - [ ] Metro configured for monorepo resolution
  - [ ] TV and mobile apps can run independently

- [ ] **TV Host App - Lobby**
  - [ ] Displays QR code with WebSocket URL
  - [ ] Shows room code for manual entry
  - [ ] Lists connected players with names and colors
  - [ ] Start Game button (enabled when 1+ players)
  - [ ] D-pad navigation works on TV remotes

- [ ] **Mobile App - Join Flow**
  - [ ] QR code scanner with camera permission
  - [ ] Manual code entry option
  - [ ] Name entry form (max 20 chars)
  - [ ] "Waiting for host" screen after joining

- [ ] **Game Flow**
  - [ ] 3-second countdown before first question
  - [ ] Question displayed with 4 options
  - [ ] 10-second timer (configurable)
  - [ ] "Let's see..." reveal animation
  - [ ] Correct answer highlighted
  - [ ] Player results shown (correct/incorrect, time)

- [ ] **Mobile Play Screen**
  - [ ] WWTBAM-style 4-button layout
  - [ ] Tap to select (highlight)
  - [ ] Tap again to confirm (submit)
  - [ ] Timer bar visible
  - [ ] Confirmation feedback on submit

- [ ] **Scoring**
  - [ ] Correct answer: 100 base + time bonus (max 900)
  - [ ] Faster response = higher bonus
  - [ ] Running score visible after each round

- [ ] **Game End**
  - [ ] Final leaderboard on TV
  - [ ] Personal position on mobile
  - [ ] Play Again option

- [ ] **Localization**
  - [ ] English (default)
  - [ ] Italian
  - [ ] All UI strings translated
  - [ ] Device language auto-detected

### Non-Functional Requirements

- [ ] WebSocket server starts within 3 seconds
- [ ] Question delivery latency < 100ms on local network
- [ ] Supports 8 concurrent players
- [ ] TV app prevents screen saver during game
- [ ] Mobile app reconnects automatically on brief disconnects

## Success Metrics

1. Players can join within 30 seconds of scanning QR
2. Full game (10 questions) completes without errors
3. Scoring is consistent and verifiable
4. Both languages display correctly throughout

## Dependencies & Prerequisites

### Required Before Development

1. Node.js 24.x installed
2. Yarn 1.x installed
3. Android TV emulator or device
4. iOS/Android device or simulator for mobile app
5. Expo CLI installed globally

### External Dependencies

| Package | Purpose | Risk Level |
|---------|---------|------------|
| nodejs-mobile-react-native | WebSocket server in RN | Medium - may need native linking |
| react-native-tvos | TV support | Low - already working |
| expo-camera | QR scanning | Low - well supported |
| react-native-qrcode-svg | QR generation | Low |
| redux-toolkit | State management | Low |
| i18next | Localization | Low |

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| nodejs-mobile-react-native fails on TV platforms | **HIGH** | **HIGH** | See detailed fallback strategies below |
| Metro monorepo issues with tvOS fork | Medium | Medium | Manual metro.config.js with explicit paths |
| Focus navigation issues on TV | Medium | Medium | Use TVFocusGuideView (native) or Norigin (web) |
| Network timing unfairness | Low | Medium | Use server timestamp for all scoring |
| Player disconnect handling | Medium | Low | Implement 30s reconnect grace period |
| Clock drift between devices | Medium | Medium | Server-authoritative timestamps only |

### CRITICAL: nodejs-mobile-react-native on TV Platforms

**Risk Level: HIGH**

Multiple research agents flagged that `nodejs-mobile-react-native` has NO documented success cases on tvOS or Android TV. The library embeds a full Node.js runtime, which:
- Increases app size significantly (50-100MB)
- May not be approved by TV app stores
- Has unknown compatibility with TV-specific APIs
- No maintainer support for TV platforms

**Recommended Approach - Validate Early:**

1. **Week 1: Spike Test**
   - Create minimal TV app with nodejs-mobile-react-native
   - Test on actual Android TV device AND tvOS simulator
   - If it works: proceed with embedded server
   - If it fails: implement Alternative A or B

**Alternative A: External Node.js Server (Recommended if embedded fails)**

Run WebSocket server as a separate process on the same device or network:

```
┌─────────────────────────────────────────┐
│        Same Device / Raspberry Pi        │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  Node.js    │◄──►│  TV Host App   │  │
│  │  Server     │    │  (Display Only)│  │
│  │  (Port 8080)│    │                │  │
│  └─────────────┘    └────────────────┘  │
└─────────────────────────────────────────┘
         ▲
         │ WebSocket
         │
    ┌────┴─────┐
    │  Mobile  │
    │  Clients │
    └──────────┘
```

Benefits:
- Proven Node.js WebSocket libraries (ws, socket.io)
- No TV platform compatibility concerns
- Can run on Raspberry Pi for dedicated hosting

**Alternative B: react-native-tcp-socket with Manual WebSocket**

Implement WebSocket protocol over raw TCP sockets:

```typescript
// apps/tv-host/src/services/WebSocketServer.ts
import TcpSocket from 'react-native-tcp-socket';

// Implement WebSocket handshake and framing manually
// More work but no external dependencies
```

**Alternative C: Managed Service (Firebase/Pusher)**

Use a cloud WebSocket service for reliable connectivity:
- Removes local network requirement
- Adds internet dependency and potential latency
- Consider for "online mode" in future phases

**Recommendation:**
1. Try nodejs-mobile-react-native first (fastest if it works)
2. Have Alternative A ready as fallback
3. Make server communication abstract so swapping is easy

## Future Considerations

- AI-generated questions (Phase 2)
- Team mode
- Custom question packs
- Online/cloud-hosted server option
- Player avatars (cute Japanese-style characters)
- Sound effects and music
- Power-ups/lifelines

## References & Research

### Internal References
- Current TV app setup: `app.json`, `package.json`
- Existing metro config: `metro.config.js`

### External References

**Core Technologies:**
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/)
- [React Native tvOS](https://github.com/react-native-tvos/react-native-tvos)
- [nodejs-mobile-react-native](https://github.com/nicknisi/nodejs-mobile-react-native)
- [Redux Toolkit](https://redux-toolkit.js.org/)
- [i18next + React Native](https://react.i18next.com/)

**TV Navigation:**
- [Norigin Spatial Navigation (NEW - hooks-based)](https://github.com/NoriginMedia/Norigin-Spatial-Navigation) - For web TV dashboard
- [Norigin npm package](https://www.npmjs.com/package/@noriginmedia/norigin-spatial-navigation)
- [Norigin Technical Blog](https://medium.com/norigintech/react-based-spatial-navigation-on-smart-tv-apps-77ed944d7be7)
- [Focus and Spatial Navigation in React](https://whoisryosuke.com/blog/2024/focus-and-spatial-navigation-in-react)
- [TVFocusGuideView Guide](https://dev.to/amazonappdev/tv-navigation-in-react-native-a-guide-to-using-tvfocusguideview-302i) - For native TV apps

**Research Articles (from deepen-plan agents):**
- Security: Use crypto.randomUUID for player IDs, not Math.random
- Performance: Server-authoritative timestamps prevent clock drift cheating
- Race Conditions: Sequence numbers + optimistic UI with reconciliation
- Architecture: Abstract server communication for easy fallback switching

## MVP Implementation Tasks

### Task Checklist

1. [x] Create monorepo structure
2. [x] Move existing TV app to apps/tv-host
3. [x] Create packages/ws-protocol with message types
4. [x] Create packages/game-logic with Redux store
5. [x] Create packages/i18n with en/it translations
6. [x] Implement WebSocket server in tv-host
7. [x] Build TV Lobby screen with QR code
8. [x] Build TV Game/Question/Reveal screens
9. [x] Create mobile app (apps/mobile)
10. [x] Build mobile QR scanner + join flow
11. [x] Build mobile play screen with answer buttons
12. [x] Implement scoring logic
13. [x] Add sample questions (10+)
14. [ ] Test full game flow end-to-end
15. [ ] Add localization to all screens
