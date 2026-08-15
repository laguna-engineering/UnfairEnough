import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import { configurePragmas, createBunAdapter, questionsRepo, runMigrations } from '@unfairenough/db';
import type { AnswerKey } from '@unfairenough/ws-protocol';
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

function sendGuess(room: GameRoom, ws: any, questionId: string, guess: number) {
  room.handlePlayerMessage(ws, JSON.stringify({ type: 'ANSWER', payload: { questionId, guess } }));
}

function sendVote(room: GameRoom, ws: any, questionId: string, vote: AnswerKey) {
  room.handlePlayerMessage(ws, JSON.stringify({ type: 'ANSWER', payload: { questionId, vote } }));
}

function sendPrediction(room: GameRoom, ws: any, questionId: string, prediction: AnswerKey) {
  room.handlePlayerMessage(
    ws,
    JSON.stringify({ type: 'ANSWER', payload: { questionId, prediction } }),
  );
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

/** Seed a set, start a room with `playerCount` players, and land on the first question. */
async function setupGameAndStartQuestion(questions: any[], playerCount: number, timeLimit = 30) {
  await questionsRepo.importQuestionSet(
    db,
    'new-types-set',
    { name: 'New Types Set', defaultTimeLimit: timeLimit, questions },
    () => crypto.randomUUID(),
    null,
  );

  const room = new GameRoom('TEST', db, null);
  const hostWs = createMockWs({ data: { role: 'host' } });
  room.setHost(hostWs);

  const players: any[] = [];
  for (let i = 0; i < playerCount; i++) {
    const playerWs = createMockWs();
    await room.addPlayer(playerWs, `Player${i}`);
    players.push(playerWs);
  }

  // Note: the question set's defaultTimeLimit is not propagated to each
  // question's own time_limit on import — the room falls back to
  // DEFAULT_QUESTION_TIME_LIMIT (15s) unless questionTimeLimit is set
  // explicitly here, so pass it through to keep timeout-path tests fast.
  room.handleHostMessage(
    hostWs,
    JSON.stringify({
      type: 'CONFIGURE_GAME',
      payload: {
        gameType: 'configured',
        questionSetId: 'new-types-set',
        questionTimeLimit: timeLimit,
      },
    }),
  );
  await wait(50);

  room.handleHostMessage(hostWs, JSON.stringify({ type: 'START_GAME' }));
  await wait(3500); // countdown (3s) + buffer

  return { room, hostWs, players };
}

// ── closest_wins ────────────────────────────────────────────────────

describe('closest_wins scoring', () => {
  const closestWinsQuestion = {
    id: 'cw1',
    type: 'closest_wins' as const,
    text: 'How many teeth does a snail have?',
    options: [],
    correctAnswer: '',
    correctValue: 25,
    range: { min: 0, max: 100 },
    difficulty: 3,
  };

  it('gives tied-distance guesses equal points, strictly more than a farther guess, regardless of order (AE2)', async () => {
    const { room, players } = await setupGameAndStartQuestion([closestWinsQuestion], 3);

    const questionMsg = findMessage(players[0], 'QUESTION');
    expect(questionMsg.payload.type).toBe('closest_wins');
    expect(questionMsg.payload.range).toEqual({ min: 0, max: 100, step: undefined });
    const questionId = questionMsg.payload.id;

    // Player 2 (farthest) answers first, player 0 (closest, tied with player 1) answers last —
    // response order must not affect points (KD4/R8: no speed bonus).
    sendGuess(room, players[2], questionId, 100);
    sendGuess(room, players[1], questionId, 30);
    sendGuess(room, players[0], questionId, 20);

    await wait(2500); // REVEALING (2s) + buffer

    const roundEnd = findMessage(players[0], 'ROUND_END');
    expect(roundEnd).toBeDefined();
    expect(roundEnd.payload.correctAnswer).toBeNull();
    expect(roundEnd.payload.questionType).toBe('closest_wins');
    expect(roundEnd.payload.correctValue).toBe(25);

    const results = roundEnd.payload.playerResults;
    const byPlayer = (i: number) => results.find((r: any) => r.name === `Player${i}`);

    const p0 = byPlayer(0); // guess 20 — distance 0.05
    const p1 = byPlayer(1); // guess 30 — distance 0.05 (tied)
    const p2 = byPlayer(2); // guess 100 — distance 0.75

    expect(p0.guess).toBe(20);
    expect(p1.guess).toBe(30);
    expect(p2.guess).toBe(100);

    expect(p0.pointsEarned).toBe(p1.pointsEarned);
    expect(p0.isClosest).toBe(true);
    expect(p1.isClosest).toBe(true);
    expect(p2.isClosest).toBe(false);
    expect(p0.pointsEarned).toBeGreaterThan(p2.pointsEarned);

    // No speed/catch-up/difficulty machinery applies to this type.
    expect(p0.timeBonusMultiplier).toBeUndefined();
    expect(p0.lifetimeHandicap).toBeUndefined();
  }, 15000);

  it('scores a non-submitting player 0 with isClosest false', async () => {
    const { room, players } = await setupGameAndStartQuestion([closestWinsQuestion], 2, 3);

    const questionMsg = findMessage(players[0], 'QUESTION');
    const questionId = questionMsg.payload.id;

    sendGuess(room, players[0], questionId, 25); // exact
    // players[1] never guesses — question ends on timeout, not early-end.
    await wait(3500 + 2500);

    const roundEnd = findMessage(players[1], 'ROUND_END');
    const results = roundEnd.payload.playerResults;
    const guesser = results.find((r: any) => r.name === 'Player0');
    const nonGuesser = results.find((r: any) => r.name === 'Player1');

    expect(guesser.isClosest).toBe(true);
    expect(guesser.pointsEarned).toBeGreaterThan(0);
    expect(nonGuesser.guess).toBeNull();
    expect(nonGuesser.pointsEarned).toBe(0);
    expect(nonGuesser.isClosest).toBe(false);
  }, 15000);
});

// ── predict_room ────────────────────────────────────────────────────

describe('predict_room resolution', () => {
  const predictRoomQuestion = {
    id: 'pr1',
    type: 'predict_room' as const,
    text: 'Best pizza topping?',
    options: [
      { key: 'A', text: 'Pepperoni' },
      { key: 'B', text: 'Mushroom' },
    ],
    correctAnswer: '',
    difficulty: 3,
  };

  it('scores every prediction of a tied winning option, and never leaks a vote to any client (R12/AE4)', async () => {
    const { room, players } = await setupGameAndStartQuestion([predictRoomQuestion], 4);
    const questionId = findMessage(players[0], 'QUESTION').payload.id;

    // 2-2 vote tie between A and B.
    sendVote(room, players[0], questionId, 'A');
    sendVote(room, players[1], questionId, 'A');
    sendVote(room, players[2], questionId, 'B');
    sendVote(room, players[3], questionId, 'B');

    sendPrediction(room, players[0], questionId, 'A');
    sendPrediction(room, players[1], questionId, 'B'); // wrong guess about the room, but A/B both win
    sendPrediction(room, players[2], questionId, 'A');
    sendPrediction(room, players[3], questionId, 'B');

    await wait(2500);

    const roundEnd = findMessage(players[0], 'ROUND_END');
    expect(roundEnd.payload.correctAnswer).toBeNull();
    expect(roundEnd.payload.questionType).toBe('predict_room');
    expect(roundEnd.payload.voteCounts).toEqual({ A: 2, B: 2 });
    expect(new Set(roundEnd.payload.winningOptions)).toEqual(new Set(['A', 'B']));

    const results = roundEnd.payload.playerResults;
    for (const r of results) {
      expect(r.predictedCorrectly).toBe(true);
      expect(r.pointsEarned).toBeGreaterThan(0);
      // No per-player vote field may ever reach a client payload.
      expect(r.vote).toBeUndefined();
    }

    // Every message this room ever sent to any client must never carry a bare `vote` key.
    for (const ws of players) {
      for (const msg of ws._messages) {
        expect(JSON.stringify(msg)).not.toMatch(/"vote":"/);
      }
    }
  }, 15000);

  it('scores a player who voted but never predicted as 0, and still counts their vote (R11/AE3)', async () => {
    const { room, players } = await setupGameAndStartQuestion([predictRoomQuestion], 2, 3);
    const questionId = findMessage(players[0], 'QUESTION').payload.id;

    sendVote(room, players[0], questionId, 'A');
    sendPrediction(room, players[0], questionId, 'A');

    sendVote(room, players[1], questionId, 'B');
    // players[1] never predicts — timer must expire (no early-end since not everyone is "done").

    await wait(3500 + 2500);

    const roundEnd = findMessage(players[0], 'ROUND_END');
    expect(roundEnd.payload.voteCounts).toEqual({ A: 1, B: 1 });

    const results = roundEnd.payload.playerResults;
    const voterOnly = results.find((r: any) => r.name === 'Player1');
    expect(voterOnly.prediction).toBeNull();
    expect(voterOnly.predictedCorrectly).toBe(false);
    expect(voterOnly.pointsEarned).toBe(0);
  }, 15000);

  it('rejects a prediction from a player who has not voted', async () => {
    const { room, players } = await setupGameAndStartQuestion([predictRoomQuestion], 1, 3);
    const questionId = findMessage(players[0], 'QUESTION').payload.id;

    sendPrediction(room, players[0], questionId, 'A');
    // No ANSWER_ACK should have been sent for the rejected prediction.
    expect(findMessage(players[0], 'ANSWER_ACK')).toBeUndefined();

    await wait(3500 + 2500);
    const roundEnd = findMessage(players[0], 'ROUND_END');
    const result = roundEnd.payload.playerResults[0];
    expect(result.prediction).toBeNull();
    expect(result.pointsEarned).toBe(0);
  }, 15000);
});
