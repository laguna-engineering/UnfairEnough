import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { GameRoom } from '../room';
import type { WSData } from '../types';
import type { DbAdapter } from '@unfairenough/db';

// Mock ServerWebSocket
function createMockWs(data: Partial<WSData> = {}): any {
  const messages: string[] = [];
  return {
    data: { roomCode: '', role: 'player', playerId: '', ...data },
    send(msg: string) {
      messages.push(msg);
    },
    close() {},
    _messages: messages,
  };
}

function getLastMessage(ws: any): any {
  const messages = ws._messages;
  return JSON.parse(messages[messages.length - 1]);
}

function findMessage(ws: any, type: string): any {
  return ws._messages
    .map((m: string) => JSON.parse(m))
    .find((m: any) => m.type === type);
}

function createMockDb(): DbAdapter {
  return {
    async run() { return { changes: 0, lastInsertRowid: 0 }; },
    async all() { return []; },
    async get() { return null; },
    async exec() {},
    async transaction<T>(fn: () => Promise<T>) { return fn(); },
  };
}

describe('GameRoom language support', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom('TEST', createMockDb());
  });

  it('includes default language (en) in WELCOME payload', () => {
    const hostWs = createMockWs({ role: 'host' });
    room.setHost(hostWs);

    const playerWs = createMockWs({ role: 'player' });
    room.addPlayer(playerWs, 'Alice');

    const welcome = findMessage(playerWs, 'WELCOME');
    expect(welcome).toBeDefined();
    expect(welcome.payload.language).toBe('en');
  });

  it('includes updated language in WELCOME after SET_LANGUAGE from host', () => {
    const hostWs = createMockWs({ role: 'host' });
    room.setHost(hostWs);

    // Host sets language to Italian
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'SET_LANGUAGE',
      payload: { language: 'it' },
    }));

    // Player joins after language was set
    const playerWs = createMockWs({ role: 'player' });
    room.addPlayer(playerWs, 'Bob');

    const welcome = findMessage(playerWs, 'WELCOME');
    expect(welcome).toBeDefined();
    expect(welcome.payload.language).toBe('it');
  });

  it('players who joined before language change keep their original WELCOME language', () => {
    const hostWs = createMockWs({ role: 'host' });
    room.setHost(hostWs);

    // Player joins with default language
    const playerWs1 = createMockWs({ role: 'player' });
    room.addPlayer(playerWs1, 'Alice');
    const welcome1 = findMessage(playerWs1, 'WELCOME');
    expect(welcome1.payload.language).toBe('en');

    // Host changes language
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'SET_LANGUAGE',
      payload: { language: 'it' },
    }));

    // Second player joins with new language
    const playerWs2 = createMockWs({ role: 'player' });
    room.addPlayer(playerWs2, 'Bob');
    const welcome2 = findMessage(playerWs2, 'WELCOME');
    expect(welcome2.payload.language).toBe('it');

    // First player still only received 'en' in their WELCOME
    const alice_welcome = findMessage(playerWs1, 'WELCOME');
    expect(alice_welcome.payload.language).toBe('en');
  });

  it('includes standard WELCOME fields alongside language', () => {
    const hostWs = createMockWs({ role: 'host' });
    room.setHost(hostWs);

    const playerWs = createMockWs({ role: 'player' });
    room.addPlayer(playerWs, 'Charlie');

    const welcome = findMessage(playerWs, 'WELCOME');
    expect(welcome.payload.playerId).toBeDefined();
    expect(welcome.payload.playerColor).toBeDefined();
    expect(welcome.payload.roomCode).toBe('TEST');
    expect(welcome.payload.language).toBe('en');
  });
});
