---
title: WebSocket Reconnection Handling
type: feat
date: 2026-02-15
---

# WebSocket Reconnection Handling

## Overview

When a player's WebSocket drops (network blip, phone sleep, app backgrounding), the server immediately removes them and broadcasts `PLAYER_LEFT`. The player's score, profile, and game position are permanently lost. The mobile client already reconnects and sends `RECONNECT { playerId }`, but the server ignores it (`// TODO`). This plan implements the server-side grace period and session restoration for both hosted and local modes.

## Problem Statement

- **Server** (`room.ts:240-242`): `RECONNECT` handler is `// TODO: reconnection support`
- **Player state coupled to WebSocket**: `RoomPlayer.ws` is a direct reference; no way to swap connections
- **Immediate removal**: `removePlayer()` deletes player from the Map on WebSocket close — no grace period
- **Local mode** (`WebSocketServer.ts`): No `RECONNECT` handling at all; socket errors create ghost players
- **Redux**: `Player.isConnected` and `setPlayerConnected` action exist but are never dispatched
- **Protocol**: No `PLAYER_DISCONNECTED` / `PLAYER_RECONNECTED` messages — only `PLAYER_LEFT` (conflates intentional leave with network drop)
- **"All answered" logic**: When a player disconnects mid-question, player count drops and may prematurely trigger round end

## Proposed Solution

30-second grace period. On WebSocket close, mark the player as disconnected (preserve state, start timer). If they reconnect within 30s, swap the WebSocket and restore. If the timer expires, remove them for real.

## Technical Approach

### Phase 1: Protocol Layer (`packages/ws-protocol/`)

**`messages.ts`** — Add two new server-to-client messages:

```typescript
| { type: 'PLAYER_DISCONNECTED'; payload: { playerId: string } }
| { type: 'PLAYER_RECONNECTED'; payload: { playerId: string } }
```

These let the host/TV distinguish network drops from intentional leaves (which remain `PLAYER_LEFT`).

No changes needed to `RECONNECT` client message — it already exists with `{ playerId: string }`.

**`validation.ts`** — No changes needed. `RECONNECT` validation already works (lines 64-76).

### Phase 2: Hosted Server (`apps/server/`)

#### 2a. Decouple player state from WebSocket (`types.ts`)

Make `ws` nullable on `RoomPlayer`:

```typescript
export interface RoomPlayer {
  playerId: string;
  name: string;
  color: string;
  score: number;
  ws: ServerWebSocket<WSData> | null;  // null when disconnected
  deviceId?: string;
  profileId?: string;
  isConnected: boolean;          // new field
  disconnectTimer?: Timer;       // new field — the 30s removal timer
}
```

#### 2b. Grace period on disconnect (`room.ts`)

Replace the current `removePlayer()` call in `index.ts:onClose` with a new flow:

1. **`handlePlayerDisconnect(playerId)`** (new method on `GameRoom`):
   - Set `player.ws = null`, `player.isConnected = false`
   - Broadcast `PLAYER_DISCONNECTED { playerId }` to host + remaining players
   - Start a 30-second timer (`player.disconnectTimer`)
   - On timer expiry → call existing `removePlayer()` (full removal + `PLAYER_LEFT`)

2. **Adjust `onClose` in `index.ts`**:
   - Instead of `room.removePlayer(data.playerId)`, call `room.handlePlayerDisconnect(data.playerId)`
   - Keep the room-destruction check, but only if `players.size === 0` (no players at all, not just no connected players)

3. **Intentional leave**: Add a `LEAVE` client message (or use the existing `disconnect()` flow). When the mobile client explicitly calls `disconnect()` (e.g., from GameOverScreen), skip the grace period and immediately call `removePlayer()`. The mobile client's `disconnect()` method should send a `LEAVE` message before closing the WebSocket.

#### 2c. RECONNECT handler (`room.ts`)

Implement the `case 'RECONNECT'` block:

```typescript
case 'RECONNECT': {
  const { playerId } = msg.payload;
  const player = this.players.get(playerId);

  if (!player) {
    // Player was already removed (timer expired or never existed)
    ws.send(JSON.stringify({
      type: 'ERROR',
      payload: { message: 'Session expired. Please rejoin.' }
    }));
    return;
  }

  // Clear the removal timer
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }

  // Swap the WebSocket
  player.ws = ws;
  player.isConnected = true;
  ws.data.playerId = playerId;

  // Send current game state to the reconnected player
  this.sendGameStateToPlayer(player);

  // Notify everyone
  this.broadcast({ type: 'PLAYER_RECONNECTED', payload: { playerId } });
  break;
}
```

#### 2d. New method: `sendGameStateToPlayer(player)` (`room.ts`)

Send the reconnected player enough state to catch up:

- Current phase (`LOBBY`, `QUESTION`, `REVEALING`, etc.)
- Current question (if in `QUESTION` phase and they haven't answered)
- Scoreboard / rankings
- Time remaining in current phase

Use the existing `GAME_STATE` message type if available, or introduce a `RECONNECT_STATE` message.

#### 2e. Adjust "all answered" logic (`room.ts`)

Currently: `this.answers.size >= this.players.size`

Change to only count connected players:

```typescript
const connectedPlayerCount = [...this.players.values()]
  .filter(p => p.isConnected).length;

if (this.answers.size >= connectedPlayerCount) {
  // All connected players have answered
}
```

If a disconnected player reconnects and hasn't answered yet, they should still be able to answer if the question phase is still active.

#### 2f. Adjust broadcast to skip disconnected players (`room.ts`)

In the `broadcast()` method (lines 863-871), skip players with `ws === null`:

```typescript
broadcast(message: ServerMessage) {
  const data = JSON.stringify(message);
  for (const player of this.players.values()) {
    if (player.ws) {
      player.ws.send(data);
    }
  }
}
```

### Phase 3: Local Mode (`apps/tv-host/`)

#### 3a. WebSocketServer.ts — RECONNECT handling

Add `RECONNECT` to the `handleMessage` switch:

- Store disconnected clients in a `Map<playerId, { timer, playerData }>` (the "graveyard")
- On socket close: move client to graveyard, start 30s timer, call `onPlayerDisconnected` callback
- On `RECONNECT { playerId }`: check graveyard, restore if found, clear timer, call `onPlayerReconnected` callback
- On timer expiry: call existing `onPlayerLeft` callback

Fix the existing bug: socket `error` handler should also fire `onPlayerLeft` (currently creates ghost players).

#### 3b. GameController.ts — Use `setPlayerConnected`

- On `onPlayerDisconnected`: dispatch `setPlayerConnected({ id: playerId, isConnected: false })`
- On `onPlayerReconnected`: dispatch `setPlayerConnected({ id: playerId, isConnected: true })`
- Only dispatch `removePlayer` when the 30s timer expires (from `onPlayerLeft`)

#### 3c. HostedGameController.ts

- Handle `PLAYER_DISCONNECTED` server message: dispatch `setPlayerConnected({ id, isConnected: false })`
- Handle `PLAYER_RECONNECTED` server message: dispatch `setPlayerConnected({ id, isConnected: true })`
- Only dispatch `removePlayer` on `PLAYER_LEFT`

### Phase 4: Mobile Client Adjustments

The mobile client (`WebSocketClient.ts`) already handles reconnection well. Minor adjustments:

#### 4a. Send `LEAVE` on intentional disconnect

In `disconnect()` method, send `{ type: 'LEAVE' }` before closing the WebSocket, so the server knows to skip the grace period.

#### 4b. Handle `RECONNECT_STATE` / state sync

When the server sends the game state after reconnection, the mobile client should update its local state to match (current phase, question, scores).

#### 4c. Handle "Session expired" error

If the server responds to `RECONNECT` with an `ERROR` (session expired), the client should reset to the `SCAN` phase and show a message like "You were disconnected too long. Please rejoin."

### Phase 5: Protocol Addition — `LEAVE` Message

Add a new client-to-server message:

```typescript
| { type: 'LEAVE' }
```

No payload needed. The server knows which player it is from `ws.data.playerId`. This distinguishes intentional departure (skip grace period) from network drop (use grace period).

## Edge Cases & Race Conditions

| Scenario | Handling |
|----------|----------|
| Disconnect during LOBBY | Grace period applies. Player appears dimmed on TV. If timer expires, removed normally. |
| Disconnect during QUESTION (before answering) | Player slot preserved. "All answered" check excludes them. If they reconnect, they can still answer if question is active. |
| Disconnect during QUESTION (after answering) | Answer is already recorded. Grace period applies. No impact on round flow. |
| Disconnect during REVEALING/RESULTS | Grace period applies. Player misses the reveal animation but stays in the game. On reconnect, sent current state. |
| All players disconnect, host stays | Room stays alive (host is still connected). Each player has independent 30s timer. |
| Player reconnects with invalid/expired playerId | Server sends `ERROR { message: 'Session expired' }`. Client resets to SCAN. |
| Player sends JOIN instead of RECONNECT after disconnect | Treated as a new player (new playerId). Old disconnected slot times out separately. Client should prefer RECONNECT if it has a stored playerId. |
| Game advances phases while disconnected | Player receives full state on reconnect (`sendGameStateToPlayer`). They'll see whatever phase is current. |
| Game ends (GAME_OVER) while disconnected | Player reconnects into GAME_OVER phase. They see final scores. Timer still clears on reconnect. |
| Phase transition at exact moment of disconnect | No race condition — phases are server-driven. The player just misses the broadcast. On reconnect they get current state. |
| Simultaneous disconnects | Each player gets an independent timer and graveyard entry. No interaction between them. |
| Host disconnects (hosted mode) | Host already has its own reconnection in `HostedGameController.ts`. Room persists; players see "host reconnecting" state. |

## Acceptance Criteria

- [x] Player disconnecting during any game phase gets a 30-second grace period before removal
- [x] Player reconnecting within 30s has their session fully restored (score, position, profile)
- [x] Other players and host see `PLAYER_DISCONNECTED` / `PLAYER_RECONNECTED` (not `PLAYER_LEFT` for network drops)
- [ ] TV UI shows disconnected players as dimmed/greyed out (using `isConnected` from Redux)
- [x] "All answered" logic only counts connected players
- [x] Intentional leave (`LEAVE` message) skips grace period and immediately removes
- [x] Expired grace period triggers normal `PLAYER_LEFT` removal
- [x] Works in both hosted mode (Bun server) and local mode (TV WebSocket server)
- [x] Mobile client handles "session expired" error gracefully (resets to SCAN)
- [x] `broadcast()` skips disconnected players (no errors from null WebSocket)
- [x] Socket error in local mode fires `onPlayerLeft` (fixes existing ghost player bug)

## Files to Modify

| File | Changes |
|------|---------|
| `packages/ws-protocol/src/messages.ts` | Add `PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED`, `LEAVE` messages |
| `packages/ws-protocol/src/validation.ts` | Add `LEAVE` validation (trivial — no payload) |
| `apps/server/src/types.ts` | Make `ws` nullable, add `isConnected`, `disconnectTimer` to `RoomPlayer` |
| `apps/server/src/room.ts` | Implement `handlePlayerDisconnect`, `RECONNECT` handler, `sendGameStateToPlayer`, adjust broadcast/answer logic |
| `apps/server/src/index.ts` | Call `handlePlayerDisconnect` instead of `removePlayer` on WebSocket close |
| `apps/tv-host/src/services/WebSocketServer.ts` | Add RECONNECT handling, graveyard pattern, fix socket error bug |
| `apps/tv-host/src/services/GameController.ts` | Use `setPlayerConnected` for disconnect/reconnect, `removePlayer` only on timer expiry |
| `apps/tv-host/src/services/HostedGameController.ts` | Handle `PLAYER_DISCONNECTED` / `PLAYER_RECONNECTED` messages |
| `apps/mobile/src/services/WebSocketClient.ts` | Send `LEAVE` on intentional disconnect, handle state sync and session expiry |

## References

- Original plan spec: `docs/plans/2026-02-05-feat-vibechallengers-multiplayer-quiz-game-plan.md` lines 493-496
- Existing RECONNECT protocol: `packages/ws-protocol/src/messages.ts:4`
- Server TODO: `apps/server/src/room.ts:240-242`
- Client reconnection logic: `apps/mobile/src/services/WebSocketClient.ts:67-70`
- Unused Redux action: `packages/game-logic/src/slices/playersSlice.ts:41-46`
- Host reconnection: `apps/tv-host/src/services/HostedGameController.ts:255-265`
- Ghost player bug: `apps/tv-host/src/services/WebSocketServer.ts:181-183`
