import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import { configurePragmas, createBunAdapter, questionsRepo, runMigrations } from '@unfairenough/db';
import { GameRoom } from '../room';

// Mid-game rejoin contract:
// - A player who disconnects mid-game keeps their seat until the room returns
//   to the lobby (no 30s expiry), scoring 0 for the rounds they miss.
// - RECONNECT restores that seat, but only for the device that joined —
//   a live session can never be taken by another device, and a same-device
//   RECONNECT while "connected" (half-open old socket) swaps the socket.
// - In the lobby, the old 30s grace-then-removal behavior still applies.

let rawDb: InstanceType<typeof Database>;
let db: DbAdapter;

function createMockWs(overrides: Partial<{ data: any }> = {}) {
  const ws: any = {
    data: { roomCode: '', role: 'player', playerId: '', ...overrides.data },
    send: (data: string) => {
      ws._messages.push(JSON.parse(data));
    },
    close: () => {
      ws._closed = true;
    },
    _closed: false,
    _messages: [] as any[],
  };
  return ws;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function findMessage(ws: any, type: string): any {
  return ws._messages.find((m: any) => m.type === type);
}

function findAllMessages(ws: any, type: string): any[] {
  return ws._messages.filter((m: any) => m.type === type);
}

function sendReconnect(room: GameRoom, ws: any, playerId: string, deviceId?: string) {
  room.handlePlayerMessage(
    ws,
    JSON.stringify({ type: 'RECONNECT', payload: { playerId, deviceId } }),
  );
}

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);

  await questionsRepo.importQuestionSet(
    db,
    'test-set',
    {
      name: 'Mid-game Rejoin Test Set',
      defaultTimeLimit: 30, // Long timeout to avoid races in tests
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice' as const,
          text: 'What is 1+1?',
          options: [
            { key: 'A', text: '1' },
            { key: 'B', text: '2' },
            { key: 'C', text: '3' },
            { key: 'D', text: '4' },
          ],
          correctAnswer: 'B',
          difficulty: 1,
        },
        {
          id: 'q2',
          type: 'multiple_choice' as const,
          text: 'What is 2+2?',
          options: [
            { key: 'A', text: '3' },
            { key: 'B', text: '4' },
            { key: 'C', text: '5' },
            { key: 'D', text: '6' },
          ],
          correctAnswer: 'B',
          difficulty: 1,
        },
      ],
    },
    () => crypto.randomUUID(),
    null,
  );
});

afterAll(() => {
  rawDb?.close();
});

/** Room with a host and two players (p0 with a deviceId), game started, first question live. */
async function setupMidGame() {
  const room = new GameRoom('TEST', db, null);
  const hostWs = createMockWs({ data: { role: 'host' } });
  room.setHost(hostWs);

  const p0DeviceId = crypto.randomUUID();
  const p0Ws = createMockWs();
  await room.addPlayer(p0Ws, 'Alice', p0DeviceId);
  const p0Id = findMessage(p0Ws, 'WELCOME').payload.playerId;

  const p1Ws = createMockWs();
  await room.addPlayer(p1Ws, 'Bob');
  const p1Id = findMessage(p1Ws, 'WELCOME').payload.playerId;

  room.handleHostMessage(
    hostWs,
    JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'test-set' },
    }),
  );
  await wait(50);
  room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
  await wait(3500); // countdown

  return { room, hostWs, p0Ws, p0Id, p0DeviceId, p1Ws, p1Id };
}

describe('mid-game disconnect keeps the seat', () => {
  it('does not remove a mid-game disconnected player after the 30s lobby grace period', async () => {
    const { room, hostWs, p0Ws, p0Id, p0DeviceId } = await setupMidGame();

    room.handlePlayerDisconnect(p0Id, p0Ws);
    expect(findMessage(hostWs, 'PLAYER_DISCONNECTED')?.payload.playerId).toBe(p0Id);

    // Well past the lobby grace period the seat must still be there.
    await wait(31_000);
    expect(findMessage(hostWs, 'PLAYER_LEFT')).toBeUndefined();

    const newWs = createMockWs();
    sendReconnect(room, newWs, p0Id, p0DeviceId);
    expect(findMessage(newWs, 'WELCOME')?.payload.playerId).toBe(p0Id);
    expect(findMessage(newWs, 'STATE_SNAPSHOT')).toBeDefined();
    expect(findMessage(hostWs, 'PLAYER_RECONNECTED')?.payload.playerId).toBe(p0Id);

    room.cleanup();
  }, 60_000);

  it('still removes a player who disconnects in the lobby after 30s', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const pWs = createMockWs();
    await room.addPlayer(pWs, 'Alice');
    const pId = findMessage(pWs, 'WELCOME').payload.playerId;

    room.handlePlayerDisconnect(pId, pWs);
    await wait(31_000);

    expect(findMessage(hostWs, 'PLAYER_LEFT')?.payload.playerId).toBe(pId);

    const newWs = createMockWs();
    sendReconnect(room, newWs, pId);
    expect(findMessage(newWs, 'ERROR')?.payload.code).toBe('SESSION_EXPIRED');

    room.cleanup();
  }, 45_000);

  it('scores a disconnected player 0 for the round they missed but keeps them in results', async () => {
    const { room, p0Ws, p0Id, p1Ws, p1Id } = await setupMidGame();

    room.handlePlayerDisconnect(p0Id, p0Ws);

    // Only Bob (the sole connected player) answers — the round resolves.
    const questionMsg = findMessage(p1Ws, 'QUESTION');
    room.handlePlayerMessage(
      p1Ws,
      JSON.stringify({
        type: 'ANSWER',
        payload: { questionId: questionMsg.payload.id, answer: 'B' },
      }),
    );
    await wait(3000);

    const roundEnd = findMessage(p1Ws, 'ROUND_END');
    expect(roundEnd).toBeDefined();
    const results = roundEnd.payload.playerResults;
    expect(results).toHaveLength(2);

    const aliceResult = results.find((r: any) => r.playerId === p0Id);
    expect(aliceResult.answer).toBeNull();
    expect(aliceResult.isCorrect).toBe(false);
    expect(aliceResult.pointsEarned).toBe(0);

    const bobResult = results.find((r: any) => r.playerId === p1Id);
    expect(bobResult.pointsEarned).toBeGreaterThan(0);

    room.cleanup();
  }, 15_000);

  it('drops players who never came back when the room resets to the lobby', async () => {
    const { room, hostWs, p0Ws, p0Id } = await setupMidGame();

    room.handlePlayerDisconnect(p0Id, p0Ws);
    expect(room.playerCount).toBe(2);

    room.reset();

    expect(findMessage(hostWs, 'PLAYER_LEFT')?.payload.playerId).toBe(p0Id);
    expect(room.playerCount).toBe(1);

    room.cleanup();
  }, 15_000);
});

describe('reconnect session-stealing guards', () => {
  it('rejects RECONNECT for a connected player from a different or unknown device', async () => {
    const { room, hostWs, p0Ws, p0Id } = await setupMidGame();

    // Different device
    const attacker1 = createMockWs();
    sendReconnect(room, attacker1, p0Id, crypto.randomUUID());
    expect(findMessage(attacker1, 'ERROR')?.payload.code).toBe('ALREADY_CONNECTED');
    expect(findMessage(attacker1, 'WELCOME')).toBeUndefined();

    // No device at all
    const attacker2 = createMockWs();
    sendReconnect(room, attacker2, p0Id);
    expect(findMessage(attacker2, 'ERROR')?.payload.code).toBe('ALREADY_CONNECTED');

    // The real session was untouched: no reconnect broadcast, socket not closed.
    expect(findMessage(hostWs, 'PLAYER_RECONNECTED')).toBeUndefined();
    expect(p0Ws._closed).toBe(false);

    room.cleanup();
  }, 15_000);

  it('lets the same device take over its own connected session (half-open old socket)', async () => {
    const { room, hostWs, p0Ws, p0Id, p0DeviceId } = await setupMidGame();

    const newWs = createMockWs();
    sendReconnect(room, newWs, p0Id, p0DeviceId);

    expect(findMessage(newWs, 'WELCOME')?.payload.playerId).toBe(p0Id);
    expect(p0Ws._closed).toBe(true);

    // The old socket's close event must not mark the fresh session disconnected.
    const disconnectsBefore = findAllMessages(hostWs, 'PLAYER_DISCONNECTED').length;
    room.handlePlayerDisconnect(p0Id, p0Ws);
    expect(findAllMessages(hostWs, 'PLAYER_DISCONNECTED')).toHaveLength(disconnectsBefore);

    room.cleanup();
  }, 15_000);

  it('rejects RECONNECT for a disconnected seat from a different device', async () => {
    const { room, p0Ws, p0Id, p0DeviceId } = await setupMidGame();

    room.handlePlayerDisconnect(p0Id, p0Ws);

    const attacker = createMockWs();
    sendReconnect(room, attacker, p0Id, crypto.randomUUID());
    expect(findMessage(attacker, 'ERROR')?.payload.code).toBe('SESSION_EXPIRED');
    expect(findMessage(attacker, 'WELCOME')).toBeUndefined();

    // The rightful device still gets back in afterwards.
    const newWs = createMockWs();
    sendReconnect(room, newWs, p0Id, p0DeviceId);
    expect(findMessage(newWs, 'WELCOME')?.payload.playerId).toBe(p0Id);

    room.cleanup();
  }, 15_000);
});
