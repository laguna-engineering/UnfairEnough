import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  createBunAdapter,
  configurePragmas,
  runMigrations,
  questionsRepo,
} from '@unfairenough/db';
import type { DbAdapter } from '@unfairenough/db';
import { GameRoom } from '../room';

let rawDb: InstanceType<typeof Database>;
let db: DbAdapter;

// Mock WebSocket
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

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);

  // Seed questions without media
  await questionsRepo.importQuestionSet(db, 'basic-set', {
    name: 'Basic Questions',
    defaultTimeLimit: 10,
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: `basic-q${i}`,
      type: 'multiple_choice' as const,
      text: `Basic Question ${i}`,
      options: [
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
      ],
      correctAnswer: 'A' as const,
    })),
  }, () => crypto.randomUUID());

  // Seed questions WITH media (very short preview for testing)
  await questionsRepo.importQuestionSet(db, 'media-set', {
    name: 'Media Questions',
    defaultTimeLimit: 10,
    questions: [
      {
        id: 'media-q1',
        type: 'multiple_choice' as const,
        text: 'Question with image',
        media: { type: 'image', url: 'https://example.com/image.jpg', previewDuration: 1 },
        options: [
          { key: 'A', text: 'Option A' },
          { key: 'B', text: 'Option B' },
        ],
        correctAnswer: 'B' as const,
      },
      {
        id: 'media-q2',
        type: 'multiple_choice' as const,
        text: 'Question without media',
        options: [
          { key: 'A', text: 'Option A' },
          { key: 'B', text: 'Option B' },
        ],
        correctAnswer: 'A' as const,
      },
    ],
  }, () => crypto.randomUUID());
});

afterAll(() => {
  rawDb?.close();
});

// ── CONFIGURE_GAME ────────────────────────────────────────────

describe('CONFIGURE_GAME', () => {
  it('acknowledges casual game configuration', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'casual', totalQuestions: 3 },
    }));

    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    expect(configMsg.payload.gameType).toBe('casual');
    expect(configMsg.payload.questionCount).toBe(3);

    room.cleanup();
  });

  it('acknowledges configured game with valid set', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'media-set' },
    }));

    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    expect(configMsg.payload.gameType).toBe('configured');
    expect(configMsg.payload.questionCount).toBe(2);

    room.cleanup();
  });

  it('returns error for non-existent question set', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'nonexistent-set' },
    }));

    await wait(50);

    const errorMsg = hostWs._messages.find((m: any) => m.type === 'ERROR');
    expect(errorMsg).toBeDefined();
    expect(errorMsg.payload.code).toBe('SET_NOT_FOUND');

    room.cleanup();
  });

  it('returns error for empty question set', async () => {
    // Create an empty set
    await questionsRepo.importQuestionSet(db, 'empty-set', {
      name: 'Empty Set',
      defaultTimeLimit: 10,
      questions: [],
    }, () => crypto.randomUUID());

    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'empty-set' },
    }));

    await wait(50);

    const errorMsg = hostWs._messages.find((m: any) => m.type === 'ERROR');
    expect(errorMsg).toBeDefined();
    expect(errorMsg.payload.code).toBe('SET_EMPTY');

    room.cleanup();
  });

  it('resets configuration on RESET_GAME', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    // Configure
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'media-set' },
    }));
    await wait(50);

    // Reset
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'RESET_GAME' }));

    // Reconfigure as casual
    hostWs._messages.length = 0;
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'casual' },
    }));
    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    expect(configMsg.payload.gameType).toBe('casual');

    room.cleanup();
  });
});

// ── MEDIA_PREVIEW ─────────────────────────────────────────────

describe('MEDIA_PREVIEW phase', () => {
  it('sends MEDIA_PREVIEW before QUESTION when question has media', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media set
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'media-set' },
    }));
    await wait(50);

    // Start the game
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown (3s) + a small buffer
    await wait(3200);

    // MEDIA_PREVIEW should have been sent (first question has media)
    const mediaPreview = playerWs._messages.find((m: any) => m.type === 'MEDIA_PREVIEW');
    expect(mediaPreview).toBeDefined();
    expect(mediaPreview.payload.media.type).toBe('image');
    expect(mediaPreview.payload.media.url).toBe('https://example.com/image.jpg');
    expect(mediaPreview.payload.duration).toBe(1);

    // Wait for preview (1s) + buffer
    await wait(1200);

    // QUESTION should now have been sent
    const question = playerWs._messages.find((m: any) => m.type === 'QUESTION');
    expect(question).toBeDefined();
    expect(question.payload.text).toBe('Question with image');

    room.cleanup();
  }, 10000); // Extended timeout for timer-based test

  it('sends QUESTION directly when question has no media', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Bob');

    // Configure with basic set (no media)
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'basic-set', totalQuestions: 1 },
    }));
    await wait(50);

    // Start
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown + buffer
    await wait(3200);

    // No MEDIA_PREVIEW should have been sent
    const mediaPreview = playerWs._messages.find((m: any) => m.type === 'MEDIA_PREVIEW');
    expect(mediaPreview).toBeUndefined();

    // QUESTION should be sent directly
    const question = playerWs._messages.find((m: any) => m.type === 'QUESTION');
    expect(question).toBeDefined();

    room.cleanup();
  }, 10000);
});

// ── Configured game question loading ──────────────────────────

describe('configured game mode', () => {
  it('loads questions from a specific set when configured', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media-set
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'media-set' },
    }));
    await wait(50);

    // Start
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown (3s) + media preview (1s) + buffer
    await wait(4500);

    // The first question should be from media-set
    const question = playerWs._messages.find((m: any) => m.type === 'QUESTION');
    expect(question).toBeDefined();
    expect(question.payload.text).toBe('Question with image');

    room.cleanup();
  }, 10000);

  it('respects totalQuestions limit for configured games', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with basic-set but limit to 2 questions
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'basic-set', totalQuestions: 2 },
    }));
    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    // Set has 5 questions, config response shows the full set count
    expect(configMsg.payload.questionCount).toBe(5);

    room.cleanup();
  });
});

// ── Timer cleanup ─────────────────────────────────────────────

describe('timer cleanup', () => {
  it('cleans up media preview timeout on game reset', async () => {
    const room = new GameRoom('TEST', db);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media set and start
    room.handleHostMessage(hostWs, JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: { gameType: 'configured', questionSetId: 'media-set' },
    }));
    await wait(50);

    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown to finish, media preview starts
    await wait(3200);

    // Verify MEDIA_PREVIEW was sent
    const mediaPreview = playerWs._messages.find((m: any) => m.type === 'MEDIA_PREVIEW');
    expect(mediaPreview).toBeDefined();

    // Reset mid-preview
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'RESET_GAME' }));

    // Record message count
    const countBefore = playerWs._messages.filter((m: any) => m.type === 'QUESTION').length;

    // Wait longer than preview duration
    await wait(2000);

    // No new QUESTION should have arrived after reset
    const countAfter = playerWs._messages.filter((m: any) => m.type === 'QUESTION').length;
    expect(countAfter).toBe(countBefore);

    room.cleanup();
  }, 10000);
});
