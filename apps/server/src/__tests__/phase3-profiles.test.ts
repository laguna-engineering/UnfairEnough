import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import {
  configurePragmas,
  createBunAdapter,
  gamesRepo,
  playersRepo,
  questionsRepo,
  runMigrations,
} from '@unfairenough/db';
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

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);

  // Seed some questions so games can start
  await questionsRepo.importQuestionSet(
    db,
    'test-set',
    {
      name: 'Test',
      defaultTimeLimit: 10,
      questions: Array.from({ length: 5 }, (_, i) => ({
        id: `q${i}`,
        type: 'multiple_choice' as const,
        text: `Question ${i}`,
        options: [
          { key: 'A', text: 'A' },
          { key: 'B', text: 'B' },
        ],
        correctAnswer: 'A' as const,
      })),
    },
    () => crypto.randomUUID(),
    null,
  );
});

afterAll(() => {
  rawDb?.close();
});

// ── Player Profile Matching ────────────────────────────────────

describe('player profile matching on JOIN', () => {
  it('creates a new profile when deviceId is provided and unknown', async () => {
    const room = new GameRoom('TEST', db, null);
    const ws = createMockWs();

    await room.addPlayer(ws, 'Alice', 'device-new-123');

    // WELCOME should be sent without profile (first time)
    const welcome = ws._messages.find((m: any) => m.type === 'WELCOME');
    expect(welcome).toBeDefined();
    expect(welcome.payload.profile).toBeUndefined();

    // Profile should exist in DB
    const profile = await playersRepo.findByDeviceId(db, 'device-new-123', null);
    expect(profile).not.toBeNull();
    expect(profile!.displayName).toBe('Alice');
  });

  it('returns profile in WELCOME when deviceId matches existing player', async () => {
    // Pre-create a player profile
    await playersRepo.createPlayer(db, 'existing-p', 'Alice', '#FF6B9D', null, 'device-existing');
    await playersRepo.incrementGames(db, 'existing-p', 500);
    await playersRepo.incrementGames(db, 'existing-p', 300);
    await playersRepo.incrementWins(db, 'existing-p');

    const room = new GameRoom('TEST', db, null);
    const ws = createMockWs();

    await room.addPlayer(ws, 'Alice', 'device-existing');

    const welcome = ws._messages.find((m: any) => m.type === 'WELCOME');
    expect(welcome).toBeDefined();
    expect(welcome.payload.profile).toBeDefined();
    expect(welcome.payload.profile.displayName).toBe('Alice');
    expect(welcome.payload.profile.totalGames).toBe(2);
    expect(welcome.payload.profile.totalWins).toBe(1);
  });

  it('updates display name when returning player uses a different name', async () => {
    await playersRepo.createPlayer(db, 'rename-p', 'OldName', '#FF6B9D', null, 'device-rename');

    const room = new GameRoom('TEST', db, null);
    const ws = createMockWs();

    await room.addPlayer(ws, 'NewName', 'device-rename');

    // Profile should have old name in WELCOME (shows previous name)
    const welcome = ws._messages.find((m: any) => m.type === 'WELCOME');
    expect(welcome.payload.profile.displayName).toBe('OldName');

    // But DB should be updated with new name
    const updated = await playersRepo.getPlayer(db, 'rename-p');
    expect(updated!.displayName).toBe('NewName');
  });

  it('joins without profile when no deviceId is provided', async () => {
    const room = new GameRoom('TEST', db, null);
    const ws = createMockWs();

    await room.addPlayer(ws, 'Anonymous');

    const welcome = ws._messages.find((m: any) => m.type === 'WELCOME');
    expect(welcome).toBeDefined();
    expect(welcome.payload.profile).toBeUndefined();
  });

  it('preserves the current device binding when claiming an unavailable profile', async () => {
    const deviceId = crypto.randomUUID();
    const otherDeviceId = crypto.randomUUID();
    const currentProfileId = crypto.randomUUID();
    const unavailableProfileId = crypto.randomUUID();

    await playersRepo.createProfile(db, currentProfileId, 'Current', '#FF6B9D', '🐱', null);
    await playersRepo.createProfile(db, unavailableProfileId, 'Taken', '#4ECDC4', '🐶', null);

    expect(await playersRepo.claimProfile(db, currentProfileId, deviceId, null)).toBe(true);
    expect(await playersRepo.claimProfile(db, unavailableProfileId, otherDeviceId, null)).toBe(
      true,
    );

    expect(await playersRepo.claimProfile(db, unavailableProfileId, deviceId, null)).toBe(false);

    const currentBinding = await playersRepo.findByDeviceId(db, deviceId, null);
    expect(currentBinding?.id).toBe(currentProfileId);
  });

  it('rejects players when room is full', async () => {
    const room = new GameRoom('TEST', db, null);

    // Fill room with 12 players
    for (let i = 0; i < 12; i++) {
      const ws = createMockWs();
      await room.addPlayer(ws, `Player${i}`);
    }

    // 13th player should be rejected
    const ws13 = createMockWs();
    const result = await room.addPlayer(ws13, 'TooMany');
    expect(result).toBeNull();

    const error = ws13._messages.find((m: any) => m.type === 'ERROR');
    expect(error).toBeDefined();
    expect(error.payload.code).toBe('ROOM_FULL');
  });
});

// ── Game Session Recording ──────────────────────────────────────

describe('game session recording', () => {
  it('records game end with winner and updates player stats', async () => {
    // Create two players with profiles
    await playersRepo.createPlayer(db, 'prof-1', 'Alice', '#FF6B9D', null, 'dev-alice');
    await playersRepo.createPlayer(db, 'prof-2', 'Bob', '#4ECDC4', null, 'dev-bob');

    // Create a game
    await gamesRepo.createGame(db, 'game-record', 'TEST', 'casual', 2, 1, null);

    // Simulate endGame recording
    await gamesRepo.endGame(db, 'game-record', 'prof-1', 'Alice');
    await playersRepo.incrementGames(db, 'prof-1', 1000);
    await playersRepo.incrementGames(db, 'prof-2', 500);
    await playersRepo.incrementWins(db, 'prof-1');

    // Verify game is ended
    const game = await gamesRepo.getGame(db, 'game-record');
    expect(game!.endedAt).not.toBeNull();
    expect(game!.winnerName).toBe('Alice');
    expect(game!.winnerPlayerId).toBe('prof-1');

    // Verify player stats updated
    const alice = await playersRepo.getPlayer(db, 'prof-1');
    expect(alice!.totalGames).toBe(1);
    expect(alice!.totalWins).toBe(1);
    expect(alice!.totalScore).toBe(1000);

    const bob = await playersRepo.getPlayer(db, 'prof-2');
    expect(bob!.totalGames).toBe(1);
    expect(bob!.totalWins).toBe(0);
    expect(bob!.totalScore).toBe(500);
  });

  it('records round results with all player data', async () => {
    await gamesRepo.createGame(db, 'game-rounds', 'TEST', 'casual', 2, 3, null);

    await gamesRepo.insertRoundResults(db, 'game-rounds', [
      {
        questionId: 'q-1',
        roundNumber: 1,
        playerId: 'p-1',
        playerName: 'Alice',
        answer: 'A',
        isCorrect: true,
        responseTimeMs: 500,
        pointsEarned: 950,
        totalScore: 950,
        rank: 1,
      },
      {
        questionId: 'q-1',
        roundNumber: 1,
        playerId: 'p-2',
        playerName: 'Bob',
        answer: null,
        isCorrect: false,
        responseTimeMs: null,
        pointsEarned: 0,
        totalScore: 0,
        rank: 2,
      },
    ]);

    const results = await gamesRepo.getGameResults(db, 'game-rounds');
    expect(results).toHaveLength(2);
    expect(results[0].rank).toBe(1);
    expect(results[0].isCorrect).toBe(true);
    expect(results[1].answer).toBeNull();
    expect(results[1].responseTimeMs).toBeNull();
  });
});

// ── REST API endpoints ──────────────────────────────────────────

describe('players REST endpoint', () => {
  it('lists all player profiles', async () => {
    await playersRepo.createPlayer(db, 'rest-p1', 'Alice', '#FF6B9D', null, 'dev-1');
    await playersRepo.createPlayer(db, 'rest-p2', 'Bob', '#4ECDC4', null, 'dev-2');

    const players = await playersRepo.listPlayers(db, null);
    expect(players.length).toBeGreaterThanOrEqual(2);
    expect(players.some((p) => p.displayName === 'Alice')).toBe(true);
    expect(players.some((p) => p.displayName === 'Bob')).toBe(true);
  });

  it('gets player stats', async () => {
    await playersRepo.createPlayer(db, 'stats-p', 'StatPlayer', '#FF6B9D', null, 'dev-stats');
    await playersRepo.incrementGames(db, 'stats-p', 1000);
    await playersRepo.incrementWins(db, 'stats-p');

    const player = await playersRepo.getPlayer(db, 'stats-p');
    expect(player!.totalGames).toBe(1);
    expect(player!.totalWins).toBe(1);
    expect(player!.totalScore).toBe(1000);
  });
});

describe('games REST endpoint', () => {
  it('lists recent games and gets game details', async () => {
    await gamesRepo.createGame(db, 'rest-g1', 'AAAA', 'casual', 2, 5, null);
    await gamesRepo.insertRoundResults(db, 'rest-g1', [
      {
        questionId: 'q-1',
        roundNumber: 1,
        playerId: 'p-1',
        playerName: 'Alice',
        answer: 'A',
        isCorrect: true,
        responseTimeMs: 500,
        pointsEarned: 950,
        totalScore: 950,
        rank: 1,
      },
    ]);
    await gamesRepo.endGame(db, 'rest-g1', null, 'Alice');

    const recent = await gamesRepo.getRecentGames(db, null);
    expect(recent.some((g) => g.id === 'rest-g1')).toBe(true);

    const game = await gamesRepo.getGame(db, 'rest-g1');
    expect(game).not.toBeNull();
    expect(game!.winnerName).toBe('Alice');

    const results = await gamesRepo.getGameResults(db, 'rest-g1');
    expect(results).toHaveLength(1);
    expect(results[0].playerName).toBe('Alice');
  });
});
