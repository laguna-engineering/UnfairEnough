import { describe, expect, test } from 'bun:test';
import type { QuestionWithMeta } from '@unfairenough/db';
import type { RoundSelectionContext } from '../utils/questionSelection';
import { selectNextQuestion } from '../utils/questionSelection';

function makeQuestion(id: string, tags: string[] = []): QuestionWithMeta {
  return {
    id,
    setId: null,
    originalId: null,
    type: 'multiple_choice',
    text: `Question ${id}`,
    category: null,
    tags,
    timeLimit: 10,
    media: null,
    options: [
      { key: 'A' as const, text: 'A' },
      { key: 'B' as const, text: 'B' },
    ],
    correctAnswer: 'A',
    playerDifficulty: null,
    explanation: null,
  };
}

describe('selectNextQuestion', () => {
  test('single question remaining returns it directly', () => {
    const q = makeQuestion('q1', ['gaming']);
    const context: RoundSelectionContext = {
      players: [{ profileId: 'p1', name: 'Alice', currentScore: 100 }],
      playerTagScores: new Map(),
    };
    expect(selectNextQuestion([q], context)).toBe(q);
  });

  test('all tied scores returns random from pool (no bias)', () => {
    const questions = [
      makeQuestion('q1', ['gaming']),
      makeQuestion('q2', ['science']),
      makeQuestion('q3', ['history']),
    ];
    const context: RoundSelectionContext = {
      players: [
        { profileId: 'p1', name: 'Alice', currentScore: 500 },
        { profileId: 'p2', name: 'Bob', currentScore: 500 },
      ],
      playerTagScores: new Map(),
    };

    // Run multiple times — should return different results (probabilistic, but with 3 options it's highly likely)
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(selectNextQuestion(questions, context).id);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  test('first round (all scores 0) returns random', () => {
    const questions = [makeQuestion('q1', ['gaming']), makeQuestion('q2', ['science'])];
    const context: RoundSelectionContext = {
      players: [
        { profileId: 'p1', name: 'Alice', currentScore: 0 },
        { profileId: 'p2', name: 'Bob', currentScore: 0 },
      ],
      playerTagScores: new Map(),
    };
    // Should not crash, just returns something
    const result = selectNextQuestion(questions, context);
    expect(questions).toContain(result);
  });

  test('trailing player gets questions easier for them', () => {
    // Alice (trailing) is good at gaming, Bob (leading) is good at science
    const gamingQ = makeQuestion('q-gaming', ['gaming']);
    const scienceQ = makeQuestion('q-science', ['science']);
    const questions = [gamingQ, scienceQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 }, // trailing
        { profileId: 'bob', name: 'Bob', currentScore: 800 }, // leading
      ],
      playerTagScores: new Map([
        ['alice', new Map([['gaming', 5000]])], // Alice is great at gaming
        ['bob', new Map([['science', 5000]])], // Bob is great at science
      ]),
    };

    // Run many times — gaming questions should be strongly preferred
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const q = selectNextQuestion(questions, context);
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }

    const gamingCount = counts.get('q-gaming') ?? 0;
    const scienceCount = counts.get('q-science') ?? 0;
    // Gaming should be picked significantly more often
    expect(gamingCount).toBeGreaterThan(scienceCount);
  });

  test('leading player good at tag X, trailing also good at tag X → no strong catch-up from X', () => {
    // Both players are good at gaming, so gaming questions don't help trailing player catch up
    const gamingQ = makeQuestion('q-gaming', ['gaming']);
    const neutralQ = makeQuestion('q-neutral', ['misc']);
    const questions = [gamingQ, neutralQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([
        ['alice', new Map([['gaming', 5000]])],
        ['bob', new Map([['gaming', 5000]])],
      ]),
    };

    // Both should be selected with more balanced distribution
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const q = selectNextQuestion(questions, context);
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }

    // Neither should dominate overwhelmingly when both are good at the same tag
    const gamingCount = counts.get('q-gaming') ?? 0;
    const neutralCount = counts.get('q-neutral') ?? 0;
    // Both should appear (no extreme bias)
    expect(gamingCount).toBeGreaterThan(0);
    expect(neutralCount).toBeGreaterThan(0);
  });

  test('empty player tag scores falls back to random-ish selection', () => {
    const questions = [makeQuestion('q1', ['gaming']), makeQuestion('q2', ['science'])];
    const context: RoundSelectionContext = {
      players: [
        { profileId: 'p1', name: 'Alice', currentScore: 200 },
        { profileId: 'p2', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map(), // No tag data at all
    };

    // Should not crash
    const result = selectNextQuestion(questions, context);
    expect(questions).toContain(result);
  });

  test('questions with no tags treated neutrally (catch-up score 0)', () => {
    const taggedQ = makeQuestion('q-tagged', ['gaming']);
    const untaggedQ = makeQuestion('q-untagged', []);
    const questions = [taggedQ, untaggedQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([['alice', new Map([['gaming', 5000]])]]),
    };

    // Tagged question should generally be preferred over untagged
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const q = selectNextQuestion(questions, context);
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }
    expect(counts.get('q-tagged') ?? 0).toBeGreaterThan(counts.get('q-untagged') ?? 0);
  });

  test('returns a question from the pool (never undefined)', () => {
    const questions = [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')];
    const context: RoundSelectionContext = {
      players: [
        { profileId: 'p1', name: 'Alice', currentScore: 100 },
        { profileId: 'p2', name: 'Bob', currentScore: 900 },
      ],
      playerTagScores: new Map(),
    };

    for (let i = 0; i < 50; i++) {
      const result = selectNextQuestion(questions, context);
      expect(result).toBeDefined();
      expect(questions).toContain(result);
    }
  });
});
