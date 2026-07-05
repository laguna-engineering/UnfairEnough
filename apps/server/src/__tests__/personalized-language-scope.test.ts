import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import { configurePragmas, createBunAdapter, questionsRepo, runMigrations } from '@unfairenough/db';
import { GameRoom } from '../room';

let rawDb: InstanceType<typeof Database>;
let db: DbAdapter;

function createMockWs(overrides: Partial<{ data: any }> = {}) {
  const ws: any = {
    data: { roomCode: '', role: 'player', playerId: '', ...overrides.data },
    send: (data: string) => ws._messages.push(JSON.parse(data)),
    close: () => {},
    _messages: [] as any[],
  };
  return ws;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);
  // Italian questions only (mirrors prod: mostly 'it')
  await questionsRepo.importQuestionSet(
    db,
    'naruto-it',
    {
      name: 'Naruto',
      language: 'it',
      defaultTimeLimit: 30,
      questions: Array.from({ length: 8 }, (_, i) => ({
        id: `n${i}`,
        type: 'multiple_choice' as const,
        text: `Domanda ${i}`,
        tags: ['naruto'],
        options: [
          { key: 'A', text: 'A' },
          { key: 'B', text: 'B' },
          { key: 'C', text: 'C' },
          { key: 'D', text: 'D' },
        ],
        correctAnswer: 'A',
        difficulty: 3,
      })),
    },
    () => crypto.randomUUID(),
    null,
  );
});
afterAll(() => rawDb?.close());

function setup() {
  const room = new GameRoom('TEST', db, null);
  const hostWs = createMockWs({ data: { role: 'host' } });
  room.setHost(hostWs);
  return { room, hostWs };
}
const personalizedPayload = {
  type: 'CONFIGURE_GAME',
  payload: { gameType: 'personalized', tags: ['naruto'], totalQuestions: 3, adaptiveMode: false },
};

describe('personalized config is scoped to the room language (regression: silent casual fallback)', () => {
  it('BUG: room defaults to en → Italian tag rejected (NO_QUESTIONS_FOR_TAGS)', async () => {
    const { room, hostWs } = setup();
    const p = createMockWs();
    await room.addPlayer(p, 'A', 'dev-a');
    room.handleHostMessage(hostWs, JSON.stringify(personalizedPayload));
    await wait(100);
    const err = hostWs._messages.find((m: any) => m.type === 'ERROR');
    const ok = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(err?.payload.code).toBe('NO_QUESTIONS_FOR_TAGS');
    expect(ok).toBeUndefined();
    room.cleanup();
  });

  it('FIX: after SET_LANGUAGE(it) → personalized config accepted with count 3', async () => {
    const { room, hostWs } = setup();
    const p = createMockWs();
    await room.addPlayer(p, 'A', 'dev-a');
    room.handleHostMessage(
      hostWs,
      JSON.stringify({ type: 'SET_LANGUAGE', payload: { language: 'it' } }),
    );
    room.handleHostMessage(hostWs, JSON.stringify(personalizedPayload));
    await wait(100);
    const err = hostWs._messages.find((m: any) => m.type === 'ERROR');
    const ok = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(err).toBeUndefined();
    expect(ok?.payload.gameType).toBe('personalized');
    expect(ok?.payload.questionCount).toBe(3);
    room.cleanup();
  });

  it('HARDENING: START_GAME after a rejected config refuses to start (no silent casual)', async () => {
    const { room, hostWs } = setup();
    const p = createMockWs();
    await room.addPlayer(p, 'A', 'dev-a');
    // Reject: room is 'en', tag is Italian-only.
    room.handleHostMessage(hostWs, JSON.stringify(personalizedPayload));
    await wait(100);
    hostWs._messages.length = 0; // clear the config-time ERROR

    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
    await wait(200);

    const err = hostWs._messages.find((m: any) => m.type === 'ERROR');
    expect(err?.payload.code).toBe('NO_QUESTIONS_FOR_TAGS');
    // Game must NOT have started with a fallback casual game.
    expect(p._messages.some((m: any) => m.type === 'GAME_STARTING')).toBe(false);
    expect(p._messages.some((m: any) => m.type === 'QUESTION')).toBe(false);
    room.cleanup();
  });
});
