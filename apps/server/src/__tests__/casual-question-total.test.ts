import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import { configurePragmas, createBunAdapter, questionsRepo, runMigrations } from '@unfairenough/db';
import { GameRoom } from '../room';

// A casual game asks the bank for a round count (10 by default) before it knows
// how many questions exist. If the bank has fewer, the game already ends at the
// last real question — but it used to keep announcing the count it *wanted*,
// so a five-question bank played "question 5 of 10" and then stopped. The
// number on screen has to be the number of questions the players will get.

let rawDb: InstanceType<typeof Database>;
let db: DbAdapter;

function createMockWs(overrides: Partial<{ data: any }> = {}) {
  const ws: any = {
    data: { roomCode: '', role: 'player', playerId: '', ...overrides.data },
    send: (data: string) => {
      ws._messages.push(JSON.parse(data));
    },
    close: () => {},
    _messages: [] as any[],
  };
  return ws;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForMessage(ws: any, type: string, timeoutMs = 8000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const msg = ws._messages.find((m: any) => m.type === type);
    if (msg) return msg;
    await wait(50);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${type} message`);
}

/** Seed a bank with exactly `count` plain questions — the whole casual pool. */
async function seedBank(count: number) {
  await questionsRepo.importQuestionSet(
    db,
    'thin-set',
    {
      name: 'Thin Bank',
      defaultTimeLimit: 10,
      questions: Array.from({ length: count }, (_, i) => ({
        id: `thin-q${i}`,
        type: 'multiple_choice' as const,
        text: `Question ${i}`,
        options: [
          { key: 'A', text: 'Option A' },
          { key: 'B', text: 'Option B' },
        ],
        correctAnswer: 'A' as const,
      })),
    },
    () => crypto.randomUUID(),
    null,
  );
}

/** Run a casual game to its first QUESTION and report the total it announced. */
async function firstQuestionTotal(payload: Record<string, unknown>): Promise<number> {
  const room = new GameRoom('TEST', db, null);
  const hostWs = createMockWs({ data: { role: 'host' } });
  room.setHost(hostWs);

  const playerWs = createMockWs();
  await room.addPlayer(playerWs, 'Alice');

  room.handleHostMessage(hostWs, JSON.stringify({ type: 'CONFIGURE_GAME', payload }));
  await wait(50);
  room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

  const question = await waitForMessage(playerWs, 'QUESTION');
  room.cleanup();
  return question.payload.totalQuestions;
}

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);
});

afterAll(() => {
  rawDb?.close();
});

describe('casual game question total', () => {
  it('announces the bank size when it holds fewer than the default 10', async () => {
    await seedBank(5);
    expect(await firstQuestionTotal({ gameType: 'casual' })).toBe(5);
  });

  it('announces the bank size when it holds fewer than the requested count', async () => {
    await seedBank(5);
    expect(await firstQuestionTotal({ gameType: 'casual', totalQuestions: 8 })).toBe(5);
  });

  it('still honours the requested count when the bank is deep enough', async () => {
    await seedBank(20);
    expect(await firstQuestionTotal({ gameType: 'casual', totalQuestions: 8 })).toBe(8);
  });

  it('still defaults to 10 when the bank is deep enough', async () => {
    await seedBank(20);
    expect(await firstQuestionTotal({ gameType: 'casual' })).toBe(10);
  });
});
