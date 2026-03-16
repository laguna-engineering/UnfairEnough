import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import {
  configurePragmas,
  createBunAdapter,
  gamesRepo,
  parseQuestionSetYaml,
  playersRepo,
  questionsRepo,
  runMigrations,
} from '@unfairenough/db';

let rawDb: InstanceType<typeof Database>;
let db: DbAdapter;

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);
});

afterAll(() => {
  rawDb?.close();
});

// ── Migrations ──────────────────────────────────────────────────

describe('migrations', () => {
  it('sets user_version to latest after migration', async () => {
    const row = await db.get<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(15);
  });

  it('creates all expected tables', async () => {
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('question_sets');
    expect(names).toContain('questions');
    expect(names).toContain('players');
    expect(names).toContain('games');
    expect(names).toContain('round_results');
  });

  it('is idempotent (running twice does not error)', async () => {
    const version = await runMigrations(db);
    expect(version).toBe(15);
  });
});

// ── YAML parsing ────────────────────────────────────────────────

describe('YAML parsing', () => {
  it('parses a valid question set', () => {
    const yaml = `
name: "Test Set"
author: "Tester"
defaultTimeLimit: 15
tags: [science, fun]
questions:
  - id: q1
    text: "What is water?"
    type: multiple_choice
    options:
      - key: A
        text: "H2O"
      - key: B
        text: "CO2"
      - key: C
        text: "NaCl"
      - key: D
        text: "O2"
    correctAnswer: A
`;
    const result = parseQuestionSetYaml(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Test Set');
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.questions[0].correctAnswer).toBe('A');
    }
  });

  it('rejects YAML with no questions', () => {
    const result = parseQuestionSetYaml('name: "Empty"\nquestions: []');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('questions'))).toBe(true);
    }
  });

  it('rejects duplicate question IDs', () => {
    const yaml = `
name: "Dupes"
questions:
  - id: same
    text: "Q1"
    type: multiple_choice
    options:
      - key: A
        text: "A"
      - key: B
        text: "B"
    correctAnswer: A
  - id: same
    text: "Q2"
    type: multiple_choice
    options:
      - key: A
        text: "A"
      - key: B
        text: "B"
    correctAnswer: B
`;
    const result = parseQuestionSetYaml(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
    }
  });

  it('rejects invalid YAML syntax', () => {
    const result = parseQuestionSetYaml('{ invalid yaml: [');
    expect(result.success).toBe(false);
  });

  it('rejects correctAnswer not in options', () => {
    const yaml = `
name: "Bad Answer"
questions:
  - text: "Q1"
    type: multiple_choice
    options:
      - key: A
        text: "A"
      - key: B
        text: "B"
    correctAnswer: D
`;
    const result = parseQuestionSetYaml(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('correctAnswer'))).toBe(true);
    }
  });

  it('defaults type to multiple_choice when omitted', () => {
    const yaml = `
name: "Default Type"
questions:
  - text: "Q1"
    options:
      - key: A
        text: "Yes"
      - key: B
        text: "No"
    correctAnswer: A
`;
    const result = parseQuestionSetYaml(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0].type).toBe('multiple_choice');
    }
  });
});

// ── Questions repository ────────────────────────────────────────

describe('questions repository', () => {
  it('imports a question set and retrieves it', async () => {
    const input = {
      name: 'Test Set',
      author: 'Tester',
      defaultTimeLimit: 10,
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice' as const,
          text: 'What is 2+2?',
          options: [
            { key: 'A', text: '3' },
            { key: 'B', text: '4' },
          ],
          correctAnswer: 'B' as const,
        },
      ],
    };

    const setId = await questionsRepo.importQuestionSet(db, 'set-1', input, () => 'q-uuid-1', null);
    expect(setId).toBe('set-1');

    const set = await questionsRepo.getQuestionSet(db, 'set-1');
    expect(set).not.toBeNull();
    expect(set!.name).toBe('Test Set');
    expect(set!.questionCount).toBe(1);
  });

  it('gets random questions from the pool', async () => {
    const input = {
      name: 'Pool',
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
    };

    let counter = 0;
    await questionsRepo.importQuestionSet(db, 'pool-set', input, () => `q-${counter++}`, null);

    const questions = await questionsRepo.getRandomQuestions(db, 3, null);
    expect(questions).toHaveLength(3);
    expect(questions[0].options).toHaveLength(2);
  });

  it('gets questions by set ID in order', async () => {
    const input = {
      name: 'Ordered Set',
      defaultTimeLimit: 10,
      questions: [
        {
          type: 'multiple_choice' as const,
          text: 'First',
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
          ],
          correctAnswer: 'A' as const,
        },
        {
          type: 'multiple_choice' as const,
          text: 'Second',
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
          ],
          correctAnswer: 'B' as const,
        },
      ],
    };

    let counter = 0;
    await questionsRepo.importQuestionSet(db, 'ordered-set', input, () => `ord-${counter++}`, null);

    const questions = await questionsRepo.getQuestionsBySet(db, 'ordered-set');
    expect(questions).toHaveLength(2);
    expect(questions[0].text).toBe('First');
    expect(questions[1].text).toBe('Second');
  });

  it('soft-deletes a set and excludes from listing', async () => {
    const input = {
      name: 'To Delete',
      defaultTimeLimit: 10,
      questions: [
        {
          type: 'multiple_choice' as const,
          text: 'Q',
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
          ],
          correctAnswer: 'A' as const,
        },
      ],
    };

    await questionsRepo.importQuestionSet(db, 'del-set', input, () => 'del-q', null);
    const deleted = await questionsRepo.softDeleteQuestionSet(db, 'del-set');
    expect(deleted).toBe(true);

    const sets = await questionsRepo.getQuestionSets(db, null);
    expect(sets.find((s) => s.id === 'del-set')).toBeUndefined();
  });

  it('excludes soft-deleted set questions from random pool', async () => {
    const input = {
      name: 'Deleted Pool',
      defaultTimeLimit: 10,
      questions: [
        {
          type: 'multiple_choice' as const,
          text: 'Hidden Q',
          options: [
            { key: 'A', text: 'A' },
            { key: 'B', text: 'B' },
          ],
          correctAnswer: 'A' as const,
        },
      ],
    };

    let counter = 0;
    await questionsRepo.importQuestionSet(
      db,
      'hidden-set',
      input,
      () => `hidden-${counter++}`,
      null,
    );
    await questionsRepo.softDeleteQuestionSet(db, 'hidden-set');

    const questions = await questionsRepo.getRandomQuestions(db, 100, null);
    expect(questions.every((q) => q.text !== 'Hidden Q')).toBe(true);
  });
});

// ── Players repository ──────────────────────────────────────────

describe('players repository', () => {
  it('creates and finds a player by device ID', async () => {
    const player = await playersRepo.createPlayer(
      db,
      'p-1',
      'Alice',
      '#FF6B9D',
      null,
      'device-123',
    );
    expect(player.displayName).toBe('Alice');

    const found = await playersRepo.findByDeviceId(db, 'device-123', null);
    expect(found).not.toBeNull();
    expect(found!.id).toBe('p-1');
  });

  it('returns null for unknown device ID', async () => {
    const found = await playersRepo.findByDeviceId(db, 'nonexistent', null);
    expect(found).toBeNull();
  });

  it('increments game count', async () => {
    await playersRepo.createPlayer(db, 'p-2', 'Bob', '#4ECDC4', null);
    await playersRepo.incrementGames(db, 'p-2', 500);

    const player = await playersRepo.getPlayer(db, 'p-2');
    expect(player!.totalGames).toBe(1);
    expect(player!.totalScore).toBe(500);
  });

  it('increments win count', async () => {
    await playersRepo.createPlayer(db, 'p-3', 'Charlie', '#FFE66D', null);
    await playersRepo.incrementWins(db, 'p-3');

    const player = await playersRepo.getPlayer(db, 'p-3');
    expect(player!.totalWins).toBe(1);
  });
});

// ── Games repository ────────────────────────────────────────────

describe('games repository', () => {
  it('creates a game and records round results', async () => {
    const game = await gamesRepo.createGame(db, 'g-1', 'ABCD', 'casual', 2, 3, null);
    expect(game.id).toBe('g-1');
    expect(game.gameType).toBe('casual');

    await gamesRepo.insertRoundResults(db, 'g-1', [
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
        answer: 'B',
        isCorrect: false,
        responseTimeMs: 800,
        pointsEarned: 0,
        totalScore: 0,
        rank: 2,
      },
    ]);

    const results = await gamesRepo.getGameResults(db, 'g-1');
    expect(results).toHaveLength(2);
    expect(results[0].isCorrect).toBe(true);
    expect(results[1].isCorrect).toBe(false);
  });

  it('ends a game with winner', async () => {
    await gamesRepo.createGame(db, 'g-2', 'EFGH', 'casual', 2, 1, null);
    await gamesRepo.endGame(db, 'g-2', 'p-1', 'Alice');

    const game = await gamesRepo.getGame(db, 'g-2');
    expect(game!.endedAt).not.toBeNull();
    expect(game!.winnerName).toBe('Alice');
  });

  it('lists recent games', async () => {
    await gamesRepo.createGame(db, 'g-3', 'AAAA', 'casual', 2, 1, null);
    await gamesRepo.createGame(db, 'g-4', 'BBBB', 'configured', 4, 10, null);

    const recent = await gamesRepo.getRecentGames(db, null);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });
});
