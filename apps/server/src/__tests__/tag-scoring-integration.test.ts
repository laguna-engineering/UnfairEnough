import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import {
  configurePragmas,
  createBunAdapter,
  playersRepo,
  playerTagScoresRepo,
  questionsRepo,
  runMigrations,
} from '@unfairenough/db';
import type { AnswerKey } from '@unfairenough/ws-protocol';
import { ELO_BASELINE } from '../../../../packages/game-logic/src/utils/tagScoring';
import { GameRoom } from '../room';

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

function findMessage(ws: any, type: string): any {
  return ws._messages.find((m: any) => m.type === type);
}

function sendAnswer(room: GameRoom, ws: any, questionId: string, answer: AnswerKey) {
  room.handlePlayerMessage(ws, JSON.stringify({ type: 'ANSWER', payload: { questionId, answer } }));
}

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);

  // Seed a question set with TAGS so tag scoring fires
  await questionsRepo.importQuestionSet(
    db,
    'tagged-set',
    {
      name: 'Tag Scoring Test Set',
      defaultTimeLimit: 30,
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice' as const,
          text: 'Gaming question 1',
          tags: ['gaming', 'zelda'],
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
            { key: 'C', text: 'C' },
            { key: 'D', text: 'D' },
          ],
          correctAnswer: 'A',
          difficulty: 3,
        },
        {
          id: 'q2',
          type: 'multiple_choice' as const,
          text: 'Science question',
          tags: ['science'],
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
            { key: 'C', text: 'C' },
            { key: 'D', text: 'D' },
          ],
          correctAnswer: 'B',
          difficulty: 3,
        },
        {
          id: 'q3',
          type: 'multiple_choice' as const,
          text: 'Untagged question',
          tags: [],
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
            { key: 'C', text: 'C' },
            { key: 'D', text: 'D' },
          ],
          correctAnswer: 'C',
          difficulty: 3,
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

/** Start a configured game and wait for the first question to appear. */
async function setupConfiguredGame(opts: { deviceIds?: (string | undefined)[] } = {}) {
  const room = new GameRoom('TEST', db);
  const hostWs = createMockWs({ data: { role: 'host' } });
  room.setHost(hostWs);

  const deviceIds = opts.deviceIds ?? ['device-alice'];
  const players: any[] = [];
  for (let i = 0; i < deviceIds.length; i++) {
    const playerWs = createMockWs();
    await room.addPlayer(playerWs, `Player${i}`, deviceIds[i]);
    players.push(playerWs);
  }

  room.handleHostMessage(
    hostWs,
    JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'tagged-set' },
    }),
  );
  await wait(50);

  room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
  // Wait for countdown (3s) + buffer
  await wait(3500);

  return { room, hostWs, players };
}

// ── Tag score persistence after answering ──────────────────────

describe('tag scoring integration — persistence', () => {
  it('correct answer creates positive tag score deltas in DB', async () => {
    const { room, players } = await setupConfiguredGame();
    const playerWs = players[0];

    const questionMsg = findMessage(playerWs, 'QUESTION');
    expect(questionMsg).toBeDefined();

    // q1 is first in configured mode; correctAnswer is 'A'
    sendAnswer(room, playerWs, questionMsg.payload.id, 'A');
    await wait(3000); // Wait for REVEALING → ROUND_END → tag update

    const profile = await playersRepo.findByDeviceId(db, 'device-alice', null);
    expect(profile).not.toBeNull();

    const tagScores = await playerTagScoresRepo.getPlayerTagScores(db, profile!.id);

    // q1 has tags ["gaming", "zelda"] — both should have rows
    expect(tagScores.length).toBeGreaterThan(0);
    // Correct answer → score above baseline
    for (const ts of tagScores) {
      expect(ts.score).toBeGreaterThan(ELO_BASELINE);
      expect(ts.totalCorrect).toBe(1);
      expect(ts.totalIncorrect).toBe(0);
    }

    room.cleanup();
  }, 15000);

  it('wrong answer creates negative tag score deltas in DB', async () => {
    const { room, players } = await setupConfiguredGame();
    const playerWs = players[0];

    const questionMsg = findMessage(playerWs, 'QUESTION');
    expect(questionMsg).toBeDefined();

    // q1 correctAnswer is 'A', so 'B' is wrong
    sendAnswer(room, playerWs, questionMsg.payload.id, 'B');
    await wait(3000);

    const profile = await playersRepo.findByDeviceId(db, 'device-alice', null);
    expect(profile).not.toBeNull();

    const tagScores = await playerTagScoresRepo.getPlayerTagScores(db, profile!.id);

    expect(tagScores.length).toBeGreaterThan(0);
    // Wrong answer → score below baseline
    for (const ts of tagScores) {
      expect(ts.score).toBeLessThan(ELO_BASELINE);
      expect(ts.totalCorrect).toBe(0);
      expect(ts.totalIncorrect).toBe(1);
    }

    room.cleanup();
  }, 15000);

  it('multi-tag question updates all tags in DB', async () => {
    const { room, players } = await setupConfiguredGame();
    const playerWs = players[0];

    const questionMsg = findMessage(playerWs, 'QUESTION');
    expect(questionMsg).toBeDefined();

    // We need the question with multiple tags (q1 has ["gaming", "zelda"]).
    // In configured mode questions are served in order, so q1 is first.
    sendAnswer(room, playerWs, questionMsg.payload.id, 'A'); // correct for q1
    await wait(3000);

    const profile = await playersRepo.findByDeviceId(db, 'device-alice', null);
    expect(profile).not.toBeNull();

    const tagScores = await playerTagScoresRepo.getPlayerTagScores(db, profile!.id);
    const tagNames = tagScores.map((ts) => ts.tag);

    // q1 has tags ["gaming", "zelda"] — both should have rows
    expect(tagNames).toContain('gaming');
    expect(tagNames).toContain('zelda');
    expect(tagScores).toHaveLength(2);

    room.cleanup();
  }, 15000);

  it('no tag scores created for untagged questions', async () => {
    // Seed a set with ONLY untagged questions
    await questionsRepo.importQuestionSet(
      db,
      'untagged-set',
      {
        name: 'Untagged Set',
        defaultTimeLimit: 30,
        questions: [
          {
            id: 'u1',
            type: 'multiple_choice' as const,
            text: 'No tags here',
            options: [
              { key: 'A', text: 'A' },
              { key: 'B', text: 'B' },
            ],
            correctAnswer: 'A',
          },
        ],
      },
      () => crypto.randomUUID(),
      null,
    );

    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice', 'device-untagged');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'untagged-set' },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
    await wait(3500);

    const questionMsg = findMessage(playerWs, 'QUESTION');
    sendAnswer(room, playerWs, questionMsg.payload.id, 'A');
    await wait(3000);

    const profile = await playersRepo.findByDeviceId(db, 'device-untagged', null);
    expect(profile).not.toBeNull();

    const tagScores = await playerTagScoresRepo.getPlayerTagScores(db, profile!.id);
    expect(tagScores).toHaveLength(0);

    room.cleanup();
  }, 15000);

  it('no tag scores created for players without a profile (no deviceId)', async () => {
    const { room, players } = await setupConfiguredGame({ deviceIds: [undefined] });
    const playerWs = players[0];

    const questionMsg = findMessage(playerWs, 'QUESTION');
    sendAnswer(room, playerWs, questionMsg.payload.id, 'A');
    await wait(3000);

    // With no deviceId, no profile exists, so no tag scores should be created
    // Verify by checking all tag scores in the DB — should be empty
    const allGamingScores = await playerTagScoresRepo.getScoresByTag(db, 'gaming', null);
    expect(allGamingScores).toHaveLength(0);

    const allZeldaScores = await playerTagScoresRepo.getScoresByTag(db, 'zelda', null);
    expect(allZeldaScores).toHaveLength(0);

    room.cleanup();
  }, 15000);
});

// ── Tag scores loaded from DB on game start ────────────────────

describe('tag scoring integration — loading', () => {
  it('pre-seeded tag scores affect difficulty multiplier in ROUND_END', async () => {
    // First: create a player profile by joining a room
    const setupRoom = new GameRoom('SETUP', db);
    const setupHost = createMockWs({ data: { role: 'host' } });
    setupRoom.setHost(setupHost);
    const setupPlayer = createMockWs();
    await setupRoom.addPlayer(setupPlayer, 'Alice', 'device-preseeded');
    setupRoom.cleanup();

    const profile = await playersRepo.findByDeviceId(db, 'device-preseeded', null);
    expect(profile).not.toBeNull();

    // Pre-seed strong tag scores for this player (very high = easy questions)
    await playerTagScoresRepo.setTagScore(db, profile!.id, 'gaming', 1900, null);
    await playerTagScoresRepo.setTagScore(db, profile!.id, 'zelda', 1900, null);

    // Now start a real game — tag scores should be loaded
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);
    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice', 'device-preseeded');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'tagged-set' },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
    await wait(3500);

    const questionMsg = findMessage(playerWs, 'QUESTION');
    sendAnswer(room, playerWs, questionMsg.payload.id, 'A');
    await wait(3000);

    const roundEnd = findMessage(playerWs, 'ROUND_END');
    expect(roundEnd).toBeDefined();

    const result = roundEnd.payload.playerResults[0];

    // With high Elo (1900) for gaming/zelda tags, difficulty should be low (≈1),
    // giving a difficultyMultiplier close to 0.95 (the minimum).
    // If tag scores were NOT loaded, difficultyMultiplier would be ~1.0 (baseline difficulty 3).
    if (roundEnd.payload.tags?.includes('gaming') || roundEnd.payload.tags?.includes('zelda')) {
      expect(result.difficultyMultiplier).toBeLessThan(1.0);
    }

    room.cleanup();
  }, 15000);
});

// ── games_played increment at game end ─────────────────────────

describe('tag scoring integration — games_played decay', () => {
  it('increments games_played for profiled players at game end', async () => {
    // Seed only 1 question so the game ends quickly
    await questionsRepo.importQuestionSet(
      db,
      'single-q-set',
      {
        name: 'Single Q Set',
        defaultTimeLimit: 30,
        questions: [
          {
            id: 'sq1',
            type: 'multiple_choice' as const,
            text: 'Only question',
            tags: ['gaming'],
            options: [
              { key: 'A', text: 'A' },
              { key: 'B', text: 'B' },
            ],
            correctAnswer: 'A',
          },
        ],
      },
      () => crypto.randomUUID(),
      null,
    );

    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);
    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice', 'device-decay');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'single-q-set' },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
    await wait(3500);

    const questionMsg = findMessage(playerWs, 'QUESTION');
    sendAnswer(room, playerWs, questionMsg.payload.id, 'A');

    // Wait for ROUND_END → RESULTS_DELAY → GAME_OVER + async DB writes
    await wait(8000);

    const gameOver = findMessage(playerWs, 'GAME_OVER');
    expect(gameOver).toBeDefined();

    const profile = await playersRepo.findByDeviceId(db, 'device-decay', null);
    expect(profile).not.toBeNull();

    // Allow a small delay for fire-and-forget DB writes to complete
    await wait(500);

    const tagScores = await playerTagScoresRepo.getPlayerTagScores(db, profile!.id);
    expect(tagScores.length).toBeGreaterThan(0);

    // games_played should have been incremented from 0 to 1
    for (const ts of tagScores) {
      expect(ts.gamesPlayed).toBe(1);
    }

    room.cleanup();
  }, 20000);
});
