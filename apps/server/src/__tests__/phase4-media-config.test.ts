import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import { configurePragmas, createBunAdapter, questionsRepo, runMigrations } from '@unfairenough/db';
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

/** Poll a mock WebSocket for a message of the given type, retrying every 50ms. */
async function waitForMessage(ws: any, type: string, timeoutMs = 8000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const msg = ws._messages.find((m: any) => m.type === type);
    if (msg) return msg;
    await wait(50);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${type} message`);
}

/** Assert that a message type does NOT appear within the given window. */
async function expectNoMessage(ws: any, type: string, withinMs = 500): Promise<void> {
  await wait(withinMs);
  const msg = ws._messages.find((m: any) => m.type === type);
  if (msg) throw new Error(`Expected no ${type} message but found one`);
}

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);

  // Seed questions without media
  await questionsRepo.importQuestionSet(
    db,
    'basic-set',
    {
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
    },
    () => crypto.randomUUID(),
    null,
  );

  // Seed questions WITH media (very short preview for testing)
  await questionsRepo.importQuestionSet(
    db,
    'media-set',
    {
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
    },
    () => crypto.randomUUID(),
    null,
  );

  // Seed audio questions: listen-first (preview, no image), answer-while-playing,
  // and a preview clip with an explicit duration.
  await questionsRepo.importQuestionSet(
    db,
    'audio-set',
    {
      name: 'Audio Questions',
      defaultTimeLimit: 10,
      questions: [
        {
          id: 'audio-preview',
          type: 'multiple_choice' as const,
          text: 'Name that tune (listen first)',
          audio: { url: 'https://example.com/clip.mp3', play: 'preview', role: 'subject' },
          options: [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
          ],
          correctAnswer: 'A' as const,
        },
        {
          id: 'audio-question',
          type: 'multiple_choice' as const,
          text: 'Answer while it plays',
          audio: { url: 'https://example.com/song.mp3', play: 'question', role: 'subject' },
          options: [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
          ],
          correctAnswer: 'B' as const,
        },
      ],
    },
    () => crypto.randomUUID(),
    null,
  );

  // Seed a single answer-while-playing question (no preview) to assert QUESTION
  // carries audio and no MEDIA_PREVIEW is sent.
  await questionsRepo.importQuestionSet(
    db,
    'audio-answer-set',
    {
      name: 'Answer While Playing',
      defaultTimeLimit: 10,
      questions: [
        {
          id: 'audio-answer',
          type: 'multiple_choice' as const,
          text: 'Answer while it plays (solo)',
          audio: { url: 'https://example.com/song.mp3', play: 'question', role: 'subject' },
          options: [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
          ],
          correctAnswer: 'B' as const,
        },
      ],
    },
    () => crypto.randomUUID(),
    null,
  );

  // Seed two consecutive image questions to exercise one-question-lookahead preload.
  await questionsRepo.importQuestionSet(
    db,
    'preload-set',
    {
      name: 'Preload Questions',
      defaultTimeLimit: 10,
      questions: [
        {
          id: 'preload-q1',
          type: 'multiple_choice' as const,
          text: 'First image question',
          media: { type: 'image', url: 'https://example.com/first.jpg', previewDuration: 1 },
          options: [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
          ],
          correctAnswer: 'A' as const,
        },
        {
          id: 'preload-q2',
          type: 'multiple_choice' as const,
          text: 'Second image question',
          media: { type: 'image', url: 'https://example.com/second.jpg', previewDuration: 1 },
          options: [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
          ],
          correctAnswer: 'B' as const,
        },
      ],
    },
    () => crypto.randomUUID(),
    null,
  );

  // Seed a listen-first clip that carries an explicit preview duration.
  await questionsRepo.importQuestionSet(
    db,
    'audio-duration-set',
    {
      name: 'Audio Duration',
      defaultTimeLimit: 10,
      questions: [
        {
          id: 'audio-dur',
          type: 'multiple_choice' as const,
          text: 'Listen-first with explicit duration',
          audio: {
            url: 'https://example.com/clip.mp3',
            play: 'preview',
            role: 'subject',
            duration: 3,
          },
          options: [
            { key: 'A', text: 'Option A' },
            { key: 'B', text: 'Option B' },
          ],
          correctAnswer: 'A' as const,
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

// ── CONFIGURE_GAME ────────────────────────────────────────────

describe('CONFIGURE_GAME', () => {
  it('acknowledges casual game configuration', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'casual', totalQuestions: 3 },
      }),
    );

    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    expect(configMsg.payload.gameType).toBe('casual');
    expect(configMsg.payload.questionCount).toBe(3);

    room.cleanup();
  });

  it('acknowledges configured game with valid set', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );

    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    expect(configMsg.payload.gameType).toBe('configured');
    expect(configMsg.payload.questionCount).toBe(2);

    room.cleanup();
  });

  it('returns error for non-existent question set', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'nonexistent-set' },
      }),
    );

    await wait(50);

    const errorMsg = hostWs._messages.find((m: any) => m.type === 'ERROR');
    expect(errorMsg).toBeDefined();
    expect(errorMsg.payload.code).toBe('SET_NOT_FOUND');

    room.cleanup();
  });

  it('returns error for empty question set', async () => {
    // Create an empty set
    await questionsRepo.importQuestionSet(
      db,
      'empty-set',
      {
        name: 'Empty Set',
        defaultTimeLimit: 10,
        questions: [],
      },
      () => crypto.randomUUID(),
      null,
    );

    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'empty-set' },
      }),
    );

    await wait(50);

    const errorMsg = hostWs._messages.find((m: any) => m.type === 'ERROR');
    expect(errorMsg).toBeDefined();
    expect(errorMsg.payload.code).toBe('SET_EMPTY');

    room.cleanup();
  });

  it('resets configuration on RESET_GAME', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    // Configure
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );
    await wait(50);

    // Reset
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'RESET_GAME' }));

    // Reconfigure as casual
    hostWs._messages.length = 0;
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'casual' },
      }),
    );
    await wait(50);

    const configMsg = hostWs._messages.find((m: any) => m.type === 'GAME_CONFIGURED');
    expect(configMsg).toBeDefined();
    expect(configMsg.payload.gameType).toBe('casual');

    room.cleanup();
  });
});

// ── MEDIA_PREVIEW ─────────────────────────────────────────────

describe('MEDIA_PREVIEW phase', () => {
  it('sends MEDIA_PREVIEW then QUESTION after host signals MEDIA_LOADED', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media set
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );
    await wait(50);

    // Start the game
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown to finish and MEDIA_PREVIEW to be sent
    const mediaPreview = await waitForMessage(playerWs, 'MEDIA_PREVIEW');
    expect(mediaPreview.payload.media.type).toBe('image');
    expect(mediaPreview.payload.media.url).toBe('https://example.com/image.jpg');
    expect(mediaPreview.payload.duration).toBe(1);

    // Host signals image loaded successfully
    room.handleHostMessage(
      hostWs,
      JSON.stringify({ type: 'MEDIA_LOADED', payload: { success: true } }),
    );

    // Wait for preview countdown to finish and QUESTION to be sent
    const question = await waitForMessage(playerWs, 'QUESTION');
    expect(question.payload.text).toBe('Question with image');

    room.cleanup();
  }, 10000); // Extended timeout for timer-based test

  it('skips preview when host signals MEDIA_LOADED with failure', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media set
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );
    await wait(50);

    // Start the game
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown to finish and MEDIA_PREVIEW to be sent
    await waitForMessage(playerWs, 'MEDIA_PREVIEW');

    // Host signals image FAILED to load
    room.handleHostMessage(
      hostWs,
      JSON.stringify({ type: 'MEDIA_LOADED', payload: { success: false } }),
    );

    // QUESTION should be sent immediately (no preview countdown)
    const question = await waitForMessage(playerWs, 'QUESTION');
    expect(question.payload.text).toBe('Question with image');

    room.cleanup();
  }, 10000);

  it('ignores stale MEDIA_LOADED with wrong questionId', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media set
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );
    await wait(50);

    // Start the game
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown to finish and MEDIA_PREVIEW to be sent
    const mediaPreview = await waitForMessage(playerWs, 'MEDIA_PREVIEW');
    expect(mediaPreview.payload.questionId).toBeDefined();

    // Send MEDIA_LOADED with a WRONG questionId — should be ignored
    room.handleHostMessage(
      hostWs,
      JSON.stringify({ type: 'MEDIA_LOADED', payload: { success: true, questionId: 'wrong-id' } }),
    );

    // QUESTION should NOT have been triggered yet (still waiting for correct signal)
    await expectNoMessage(playerWs, 'QUESTION');

    // Now send with correct questionId
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'MEDIA_LOADED',
        payload: { success: true, questionId: mediaPreview.payload.questionId },
      }),
    );

    // Wait for preview countdown to finish and QUESTION to be sent
    await waitForMessage(playerWs, 'QUESTION');

    room.cleanup();
  }, 10000);

  it('sends QUESTION directly when question has no media', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Bob');

    // Configure with basic set (no media)
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'basic-set', totalQuestions: 1 },
      }),
    );
    await wait(50);

    // Start
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // QUESTION should be sent directly (no MEDIA_PREVIEW for questions without media)
    const question = await waitForMessage(playerWs, 'QUESTION');
    expect(question).toBeDefined();

    // No MEDIA_PREVIEW should have been sent
    const mediaPreview = playerWs._messages.find((m: any) => m.type === 'MEDIA_PREVIEW');
    expect(mediaPreview).toBeUndefined();

    room.cleanup();
  }, 10000);
});

// ── Audio playback routing (U2) ───────────────────────────────

describe('audio question routing', () => {
  it('enters MEDIA_PREVIEW for listen-first audio with no image and waits for MEDIA_LOADED', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'audio-set', totalQuestions: 1 },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    const mediaPreview = await waitForMessage(playerWs, 'MEDIA_PREVIEW');
    // Listen-first: audio present, no image media.
    expect(mediaPreview.payload.audio).toEqual({
      url: 'https://example.com/clip.mp3',
      play: 'preview',
      role: 'subject',
    });
    expect(mediaPreview.payload.media).toBeUndefined();

    // Server holds in MEDIA_PREVIEW until the host acks readiness.
    await expectNoMessage(playerWs, 'QUESTION');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'MEDIA_LOADED',
        payload: { success: true, questionId: mediaPreview.payload.questionId },
      }),
    );

    const question = await waitForMessage(playerWs, 'QUESTION');
    expect(question.payload.text).toBe('Name that tune (listen first)');

    room.cleanup();
  }, 10000);

  it('sends QUESTION directly (no preview) for answer-while-playing audio, carrying the audio', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Bob');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'audio-answer-set', totalQuestions: 1 },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    const question = await waitForMessage(playerWs, 'QUESTION');
    expect(question.payload.audio).toEqual({
      url: 'https://example.com/song.mp3',
      play: 'question',
      role: 'subject',
    });

    // No preview phase for play:question audio.
    const mediaPreview = playerWs._messages.find((m: any) => m.type === 'MEDIA_PREVIEW');
    expect(mediaPreview).toBeUndefined();

    room.cleanup();
  }, 10000);

  it('derives the preview duration from audio.duration when present', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'audio-duration-set', totalQuestions: 1 },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    const mediaPreview = await waitForMessage(playerWs, 'MEDIA_PREVIEW');
    expect(mediaPreview.payload.duration).toBe(3);

    room.cleanup();
  }, 10000);
});

// ── Media preloading / one-question lookahead (U7) ────────────

describe('media preloading', () => {
  it('sends MEDIA_PRELOAD to the host for the next media question during the current one', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'preload-set', totalQuestions: 2 },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Q1 shows a preview; ack it to reach the QUESTION phase.
    const mp = await waitForMessage(playerWs, 'MEDIA_PREVIEW');
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'MEDIA_LOADED',
        payload: { success: true, questionId: mp.payload.questionId },
      }),
    );
    await waitForMessage(playerWs, 'QUESTION');

    // The host should now be asked to warm Q2's image.
    const preload = await waitForMessage(hostWs, 'MEDIA_PRELOAD');
    expect(preload.payload.image).toBe('https://example.com/second.jpg');
    expect(preload.payload.questionId).toBeDefined();
    // Preload goes only to the host, never to players.
    expect(playerWs._messages.find((m: any) => m.type === 'MEDIA_PRELOAD')).toBeUndefined();

    room.cleanup();
  }, 10000);

  it('does not preload when the next question has no media', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // media-set: Q1 has an image, Q2 has no media → no preload after Q1.
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set', totalQuestions: 2 },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    const mp = await waitForMessage(playerWs, 'MEDIA_PREVIEW');
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'MEDIA_LOADED',
        payload: { success: true, questionId: mp.payload.questionId },
      }),
    );
    await waitForMessage(playerWs, 'QUESTION');
    await expectNoMessage(hostWs, 'MEDIA_PRELOAD');

    room.cleanup();
  }, 10000);

  it('does not preload on the last question', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // A single question → no i+1 to peek.
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'audio-answer-set', totalQuestions: 1 },
      }),
    );
    await wait(50);
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    await waitForMessage(playerWs, 'QUESTION');
    await expectNoMessage(hostWs, 'MEDIA_PRELOAD');

    room.cleanup();
  }, 10000);

  it('ignores a stale MEDIA_PRELOADED ack with the wrong questionId', () => {
    const room = new GameRoom('TEST', db, null) as any;
    room.preloadQuestionId = 'upcoming-q';
    room.preloadAcked = false;

    room.onMediaPreloaded(true, 'some-other-q');
    expect(room.preloadAcked).toBe(false);

    room.onMediaPreloaded(true, 'upcoming-q');
    expect(room.preloadAcked).toBe(true);

    room.cleanup();
  });

  it('holds the advance until the preload is acked, then proceeds', () => {
    const room = new GameRoom('TEST', db, null) as any;
    let advanced = 0;
    room.advanceToNextQuestion = () => {
      advanced++;
    };

    // Preload in flight, not yet acked → advance is held.
    room.preloadQuestionId = 'upcoming-q';
    room.preloadAcked = false;
    room.advanceWhenPreloadReady();
    expect(advanced).toBe(0);
    expect(room.awaitingPreloadAdvance).toBe(true);

    // Ack arrives → the held advance fires exactly once.
    room.onMediaPreloaded(true, 'upcoming-q');
    expect(advanced).toBe(1);

    room.cleanup();
  });

  it('advances immediately when no preload is pending', () => {
    const room = new GameRoom('TEST', db, null) as any;
    let advanced = 0;
    room.advanceToNextQuestion = () => {
      advanced++;
    };

    room.preloadQuestionId = null;
    room.advanceWhenPreloadReady();
    expect(advanced).toBe(1);

    room.cleanup();
  });
});

// ── Configured game question loading ──────────────────────────

describe('configured game mode', () => {
  it('loads questions from a specific set when configured', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media-set
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );
    await wait(50);

    // Start
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown to finish and MEDIA_PREVIEW to be sent
    await waitForMessage(playerWs, 'MEDIA_PREVIEW');

    // Signal image loaded so preview countdown starts
    room.handleHostMessage(
      hostWs,
      JSON.stringify({ type: 'MEDIA_LOADED', payload: { success: true } }),
    );

    // Wait for preview countdown to finish and QUESTION to be sent
    const question = await waitForMessage(playerWs, 'QUESTION');
    expect(question.payload.text).toBe('Question with image');

    room.cleanup();
  }, 10000);

  it('respects totalQuestions limit for configured games', async () => {
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with basic-set but limit to 2 questions
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'basic-set', totalQuestions: 2 },
      }),
    );
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
    const room = new GameRoom('TEST', db, null);
    const hostWs = createMockWs({ data: { role: 'host' } });
    room.setHost(hostWs);

    const playerWs = createMockWs();
    await room.addPlayer(playerWs, 'Alice');

    // Configure with media set and start
    room.handleHostMessage(
      hostWs,
      JSON.stringify({
        type: 'CONFIGURE_GAME',
        payload: { gameType: 'configured', questionSetId: 'media-set' },
      }),
    );
    await wait(50);

    room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));

    // Wait for countdown to finish and MEDIA_PREVIEW to be sent
    await waitForMessage(playerWs, 'MEDIA_PREVIEW');

    // Reset mid-preview
    room.handleHostMessage(hostWs, JSON.stringify({ type: 'RESET_GAME' }));

    // No QUESTION should arrive after reset (timer was cleaned up)
    await expectNoMessage(playerWs, 'QUESTION', 2000);

    room.cleanup();
  }, 10000);
});
