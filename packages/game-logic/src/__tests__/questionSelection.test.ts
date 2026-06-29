import { describe, expect, test } from 'bun:test';
import type { QuestionWithMeta } from '@unfairenough/db';
import type { RoundSelectionContext, SelectableQuestion } from '../utils/questionSelection';
import {
  buildQuestionPool,
  filterRecentlyServedQuestions,
  selectNextQuestion,
} from '../utils/questionSelection';

function makeQuestion(id: string, tags: string[] = [], difficulty = 3): QuestionWithMeta {
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
    difficulty,
    explanation: null,
  };
}

function makeMinimalQuestion(
  id: string,
  tags: string[] = [],
  difficulty?: number,
): SelectableQuestion {
  return { id, tags, difficulty };
}

/** Deterministic seeded random for reproducible tests */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── selectNextQuestion ─────────────────────────────────────────────

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
    const result = selectNextQuestion(questions, context);
    expect(questions).toContain(result);
  });

  test('trailing player gets questions easier for them', () => {
    const gamingQ = makeQuestion('q-gaming', ['gaming']);
    const scienceQ = makeQuestion('q-science', ['science']);
    const questions = [gamingQ, scienceQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([
        ['alice', new Map([['gaming', 1800]])],
        ['bob', new Map([['science', 1800]])],
      ]),
    };

    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const q = selectNextQuestion(questions, context);
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }

    const gamingCount = counts.get('q-gaming') ?? 0;
    const scienceCount = counts.get('q-science') ?? 0;
    expect(gamingCount).toBeGreaterThan(scienceCount);
  });

  test('leading player good at tag X, trailing also good at tag X → no strong catch-up from X', () => {
    const gamingQ = makeQuestion('q-gaming', ['gaming']);
    const neutralQ = makeQuestion('q-neutral', ['misc']);
    const questions = [gamingQ, neutralQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([
        ['alice', new Map([['gaming', 1800]])],
        ['bob', new Map([['gaming', 1800]])],
      ]),
    };

    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const q = selectNextQuestion(questions, context);
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }

    const gamingCount = counts.get('q-gaming') ?? 0;
    const neutralCount = counts.get('q-neutral') ?? 0;
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
      playerTagScores: new Map(),
    };

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
      playerTagScores: new Map([['alice', new Map([['gaming', 1800]])]]),
    };

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

  // ── Phase ramp tests ───────────────────────────────────────────

  test('roundIndex=0 (phase ramp start) selects randomly', () => {
    const gamingQ = makeQuestion('q-gaming', ['gaming']);
    const scienceQ = makeQuestion('q-science', ['science']);
    const questions = [gamingQ, scienceQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([
        ['alice', new Map([['gaming', 1800]])],
        ['bob', new Map([['science', 1800]])],
      ]),
      roundIndex: 0,
      totalRounds: 10,
    };

    // At roundIndex=0 catchUpInfluence=0, so selection is random
    const random = seededRandom(42);
    const result = selectNextQuestion(questions, context, random);
    expect(questions).toContain(result);
  });

  test('phase ramp deterministic: same seed produces same result', () => {
    const questions = [
      makeQuestion('q1', ['gaming']),
      makeQuestion('q2', ['science']),
      makeQuestion('q3', ['history']),
    ];
    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([['alice', new Map([['gaming', 1800]])]]),
      roundIndex: 5,
      totalRounds: 10,
    };

    const result1 = selectNextQuestion(questions, context, seededRandom(123));
    const result2 = selectNextQuestion(questions, context, seededRandom(123));
    expect(result1.id).toBe(result2.id);
  });

  test('late rounds (high roundIndex) favor catch-up more than early rounds', () => {
    const gamingQ = makeQuestion('q-gaming', ['gaming']);
    const scienceQ = makeQuestion('q-science', ['science']);
    const questions = [gamingQ, scienceQ];

    // Alice trails, is great at gaming → catch-up should prefer gaming Q
    const baseContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([
        ['alice', new Map([['gaming', 1800]])],
        ['bob', new Map([['science', 1800]])],
      ]),
    };

    // Early round (roundIndex=1 out of 20 → catchUpInfluence ≈ 0.067)
    let earlyGaming = 0;
    for (let i = 0; i < 500; i++) {
      const q = selectNextQuestion(questions, {
        ...baseContext,
        roundIndex: 1,
        totalRounds: 20,
      });
      if (q.id === 'q-gaming') earlyGaming++;
    }

    // Late round (roundIndex=18 out of 20 → catchUpInfluence = 1.0)
    let lateGaming = 0;
    for (let i = 0; i < 500; i++) {
      const q = selectNextQuestion(questions, {
        ...baseContext,
        roundIndex: 18,
        totalRounds: 20,
      });
      if (q.id === 'q-gaming') lateGaming++;
    }

    // Late rounds should show stronger catch-up preference
    expect(lateGaming).toBeGreaterThan(earlyGaming);
  });

  test('single player returns random (no catch-up possible)', () => {
    const questions = [makeQuestion('q1', ['gaming']), makeQuestion('q2', ['science'])];
    const context: RoundSelectionContext = {
      players: [{ profileId: 'p1', name: 'Alice', currentScore: 100 }],
      playerTagScores: new Map([['p1', new Map([['gaming', 1800]])]]),
      roundIndex: 5,
      totalRounds: 10,
    };

    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(selectNextQuestion(questions, context).id);
    }
    // Should pick from both (random)
    expect(results.size).toBeGreaterThan(1);
  });

  test('works with SelectableQuestion (minimal interface)', () => {
    const q1 = makeMinimalQuestion('q1', ['gaming']);
    const q2 = makeMinimalQuestion('q2', ['science']);

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'p1', name: 'Alice', currentScore: 200 },
        { profileId: 'p2', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map(),
      roundIndex: 5,
      totalRounds: 10,
    };

    const result = selectNextQuestion([q1, q2], context);
    expect([q1, q2]).toContain(result);
  });
});

// ── buildQuestionPool ──────────────────────────────────────────────

describe('buildQuestionPool', () => {
  test('empty input returns empty array', () => {
    const result = buildQuestionPool([], { nRounds: 5 });
    expect(result).toEqual([]);
  });

  test('pool smaller than nRounds returns all questions', () => {
    const questions = [makeMinimalQuestion('q1', ['a']), makeMinimalQuestion('q2', ['b'])];
    const result = buildQuestionPool(questions, { nRounds: 5 });
    expect(result).toHaveLength(2);
    expect(new Set(result.map((q) => q.id))).toEqual(new Set(['q1', 'q2']));
  });

  test('pool equal to nRounds returns all questions', () => {
    const questions = [
      makeMinimalQuestion('q1', ['a']),
      makeMinimalQuestion('q2', ['b']),
      makeMinimalQuestion('q3', ['c']),
    ];
    const result = buildQuestionPool(questions, { nRounds: 3 });
    expect(result).toHaveLength(3);
  });

  test('cold start (no tag scores) maximizes tag diversity', () => {
    // 10 questions: 5 "gaming", 3 "science", 2 "history"
    const questions = [
      ...Array.from({ length: 5 }, (_, i) => makeMinimalQuestion(`g${i}`, ['gaming'])),
      ...Array.from({ length: 3 }, (_, i) => makeMinimalQuestion(`s${i}`, ['science'])),
      ...Array.from({ length: 2 }, (_, i) => makeMinimalQuestion(`h${i}`, ['history'])),
    ];

    const random = seededRandom(42);
    const result = buildQuestionPool(questions, { nRounds: 3 }, random);
    // Target size = min(9, 10) = 9

    // All three tags should be represented
    const tags = new Set(result.flatMap((q) => q.tags));
    expect(tags).toContain('gaming');
    expect(tags).toContain('science');
    expect(tags).toContain('history');
  });

  test('deterministic: same seed produces same pool', () => {
    const questions = Array.from({ length: 20 }, (_, i) =>
      makeMinimalQuestion(`q${i}`, [`tag${i % 5}`]),
    );

    const result1 = buildQuestionPool(questions, { nRounds: 5 }, seededRandom(99));
    const result2 = buildQuestionPool(questions, { nRounds: 5 }, seededRandom(99));

    expect(result1.map((q) => q.id)).toEqual(result2.map((q) => q.id));
  });

  test('with tag scores: includes strength-targeted and diverse questions', () => {
    const questions = [
      makeMinimalQuestion('gaming1', ['gaming']),
      makeMinimalQuestion('gaming2', ['gaming']),
      makeMinimalQuestion('gaming3', ['gaming']),
      makeMinimalQuestion('science1', ['science']),
      makeMinimalQuestion('science2', ['science']),
      makeMinimalQuestion('history1', ['history']),
      makeMinimalQuestion('art1', ['art']),
      makeMinimalQuestion('music1', ['music']),
      makeMinimalQuestion('sports1', ['sports']),
    ];

    const playerTagScores = new Map([
      ['player1', new Map([['gaming', 1800]])], // Strong at gaming
    ]);

    const random = seededRandom(42);
    const result = buildQuestionPool(questions, { nRounds: 2, playerTagScores }, random);
    // Target size = min(6, 9) = 6

    expect(result).toHaveLength(6);

    // Strength bucket should include gaming questions (high score)
    const ids = result.map((q) => q.id);
    // At least some gaming questions should be in the pool
    const gamingInPool = ids.filter((id) => id.startsWith('gaming')).length;
    expect(gamingInPool).toBeGreaterThanOrEqual(1);
  });

  test('target size is capped at 3× nRounds', () => {
    const questions = Array.from({ length: 100 }, (_, i) =>
      makeMinimalQuestion(`q${i}`, [`tag${i % 10}`]),
    );

    const result = buildQuestionPool(questions, { nRounds: 5 }, seededRandom(1));
    expect(result).toHaveLength(15); // 5 * 3
  });

  test('target size capped at available questions', () => {
    const questions = Array.from({ length: 8 }, (_, i) =>
      makeMinimalQuestion(`q${i}`, [`tag${i % 3}`]),
    );

    const result = buildQuestionPool(questions, { nRounds: 5 }, seededRandom(1));
    // 5*3=15 but only 8 available → returns all 8
    expect(result).toHaveLength(8);
  });

  test('works with QuestionWithMeta (full type)', () => {
    const questions = [
      makeQuestion('q1', ['gaming']),
      makeQuestion('q2', ['science']),
      makeQuestion('q3', ['history']),
      makeQuestion('q4', ['art']),
    ];

    const result = buildQuestionPool(questions, { nRounds: 1 }, seededRandom(42));
    // target = min(3, 4) = 3
    expect(result).toHaveLength(3);
    // Should return QuestionWithMeta instances
    expect(result[0].text).toBeDefined();
  });

  test('empty tag scores map treated as cold start', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeMinimalQuestion(`q${i}`, [`tag${i % 4}`]),
    );

    const withEmpty = buildQuestionPool(
      questions,
      { nRounds: 3, playerTagScores: new Map() },
      seededRandom(42),
    );
    const withoutScores = buildQuestionPool(questions, { nRounds: 3 }, seededRandom(42));

    // Both should produce same result (same cold-start path)
    expect(withEmpty.map((q) => q.id)).toEqual(withoutScores.map((q) => q.id));
  });

  test('difficulty spread: prefers underrepresented difficulty levels among tag ties', () => {
    // All questions share the same tag, so tag coverage is always tied.
    // 8 easy (diff=1) and 2 hard (diff=5) — pool should include both hard ones
    const questions = [
      ...Array.from({ length: 8 }, (_, i) => makeMinimalQuestion(`easy${i}`, ['trivia'], 1)),
      makeMinimalQuestion('hard0', ['trivia'], 5),
      makeMinimalQuestion('hard1', ['trivia'], 5),
    ];

    // Run many times to check the bias statistically
    let hardInPool = 0;
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      const pool = buildQuestionPool(questions, { nRounds: 2 }, seededRandom(i + 1));
      // target size = min(6, 10) = 6
      const hardCount = pool.filter((q) => q.id.startsWith('hard')).length;
      hardInPool += hardCount;
    }

    // Without difficulty bias, expected hard count per pool ≈ 6*(2/10) = 1.2
    // With difficulty bias, hard questions should be selected more often since diff=5 is underrepresented
    // Average should be above random baseline
    const avgHard = hardInPool / iterations;
    expect(avgHard).toBeGreaterThan(1.2);
  });

  test('difficulty spread: works with all same difficulty (no-op bias)', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeMinimalQuestion(`q${i}`, [`tag${i % 3}`], 3),
    );

    const random = seededRandom(42);
    const pool = buildQuestionPool(questions, { nRounds: 3 }, random);
    // Should still work normally — all difficulty=3
    expect(pool).toHaveLength(9); // min(9, 10) = 9
  });

  test('difficulty spread: questions without difficulty default to 3', () => {
    const questions = [
      makeMinimalQuestion('no-diff', ['a']), // difficulty=undefined → treated as 3
      makeMinimalQuestion('diff3', ['b'], 3),
      makeMinimalQuestion('diff1', ['c'], 1),
      makeMinimalQuestion('diff5', ['d'], 5),
    ];

    const pool = buildQuestionPool(questions, { nRounds: 1 }, seededRandom(42));
    // target = min(3, 4) = 3; should include a spread of difficulties
    expect(pool).toHaveLength(3);
    const diffs = pool.map((q) => q.difficulty ?? 3);
    // All three unique difficulties available (1, 3, 5) should be represented
    const uniqueDiffs = new Set(diffs);
    expect(uniqueDiffs.size).toBe(3);
  });
});

// ── selectNextQuestion — tag avoidance ──────────────────────────────

describe('selectNextQuestion — tag avoidance', () => {
  const baseContext: Omit<RoundSelectionContext, 'previousQuestionTags'> = {
    players: [
      { profileId: 'p1', name: 'Alice', currentScore: 200 },
      { profileId: 'p2', name: 'Bob', currentScore: 800 },
    ],
    playerTagScores: new Map(),
  };

  test('avoids same-tag question when alternatives exist', () => {
    const qA = makeMinimalQuestion('A', ['gaming']);
    const qB = makeMinimalQuestion('B', ['science']);
    const qC = makeMinimalQuestion('C', ['gaming', 'history']);
    const pool = [qA, qB, qC];

    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const q = selectNextQuestion(pool, {
        ...baseContext,
        previousQuestionTags: ['gaming'],
      });
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }
    // Only B has no gaming overlap
    expect(counts.get('B')).toBe(100);
    expect(counts.get('A') ?? 0).toBe(0);
    expect(counts.get('C') ?? 0).toBe(0);
  });

  test('fallback when all candidates overlap with previous tags', () => {
    const q1 = makeMinimalQuestion('q1', ['gaming']);
    const q2 = makeMinimalQuestion('q2', ['gaming']);
    const pool = [q1, q2];

    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(
        selectNextQuestion(pool, {
          ...baseContext,
          previousQuestionTags: ['gaming'],
        }).id,
      );
    }
    // Both should be selected (fallback to full pool)
    expect(results.size).toBe(2);
  });

  test('no previousQuestionTags → no filtering', () => {
    const qA = makeMinimalQuestion('A', ['gaming']);
    const qB = makeMinimalQuestion('B', ['science']);
    const qC = makeMinimalQuestion('C', ['gaming', 'history']);
    const pool = [qA, qB, qC];

    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(selectNextQuestion(pool, baseContext).id);
    }
    // All 3 should be selected over multiple runs
    expect(results.size).toBe(3);
  });

  test('multi-tag overlap: only non-overlapping question selected', () => {
    const q1 = makeMinimalQuestion('q1', ['science']);
    const q2 = makeMinimalQuestion('q2', ['history', 'art']);
    const q3 = makeMinimalQuestion('q3', ['gaming']);
    const pool = [q1, q2, q3];

    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const q = selectNextQuestion(pool, {
        ...baseContext,
        previousQuestionTags: ['gaming', 'history'],
      });
      counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }
    // Only q1 ("science") has no overlap with ["gaming", "history"]
    expect(counts.get('q1')).toBe(100);
    expect(counts.get('q2') ?? 0).toBe(0);
    expect(counts.get('q3') ?? 0).toBe(0);
  });

  test('catch-up scoring still works after tag-avoidance filtering', () => {
    // Alice trails, is great at science → catch-up should prefer science Q
    // Previous question was gaming → gaming candidates removed
    const scienceQ = makeMinimalQuestion('science', ['science']);
    const historyQ = makeMinimalQuestion('history', ['history']);
    const gamingQ = makeMinimalQuestion('gaming', ['gaming']);
    const pool = [scienceQ, historyQ, gamingQ];

    const context: RoundSelectionContext = {
      players: [
        { profileId: 'alice', name: 'Alice', currentScore: 200 },
        { profileId: 'bob', name: 'Bob', currentScore: 800 },
      ],
      playerTagScores: new Map([
        ['alice', new Map([['science', 1800]])],
        ['bob', new Map([['history', 1800]])],
      ]),
      previousQuestionTags: ['gaming'],
    };

    let scienceCount = 0;
    for (let i = 0; i < 200; i++) {
      const q = selectNextQuestion(pool, context);
      if (q.id === 'science') scienceCount++;
      // gaming should never be selected (filtered out)
      expect(q.id).not.toBe('gaming');
    }
    // science should be preferred due to catch-up
    expect(scienceCount).toBeGreaterThan(100);
  });
});

describe('filterRecentlyServedQuestions', () => {
  // The function only reads `.id`, so minimal objects exercise the contract.
  const q = (id: string) => ({ id });
  const ids = (pool: { id: string }[]) => pool.map((p) => p.id);

  test('returns the pool unchanged when nothing has been served', () => {
    const pool = [q('a'), q('b'), q('c')];
    expect(filterRecentlyServedQuestions(pool, 2, [])).toBe(pool);
  });

  test('excludes recently-served questions when enough fresh ones remain', () => {
    const pool = [q('a'), q('b'), q('c'), q('d'), q('e')];
    // 'a' and 'b' were served; pool has 3 others and we need 2.
    expect(ids(filterRecentlyServedQuestions(pool, 2, ['a', 'b']))).toEqual(['c', 'd', 'e']);
  });

  test('preserves input order among the unseen questions', () => {
    const pool = [q('a'), q('b'), q('c'), q('d')];
    expect(ids(filterRecentlyServedQuestions(pool, 2, ['c']))).toEqual(['a', 'b', 'd']);
  });

  test('relaxes when too few unseen remain, reusing the least-recently-served first', () => {
    const pool = [q('x'), q('y'), q('z'), q('fresh')];
    // Served oldest→newest: x, y, z. Need 3 but only 'fresh' is unseen.
    const result = ids(filterRecentlyServedQuestions(pool, 3, ['x', 'y', 'z']));
    expect(result[0]).toBe('fresh'); // unseen first
    expect(result[result.length - 1]).toBe('z'); // most-recently-served reused last
    expect(result).toEqual(['fresh', 'x', 'y', 'z']);
  });

  test('reproduces the production fix: a question from the previous game is not re-served', () => {
    const g13Served = ['metal-gear', 'band', 'q3', 'q4', 'q5'];
    const g14Pool = [
      q('metal-gear'),
      q('band'),
      q('n1'),
      q('n2'),
      q('n3'),
      q('n4'),
      q('n5'),
      q('q3'),
    ];
    const selected = ids(filterRecentlyServedQuestions(g14Pool, 4, g13Served)).slice(0, 4);
    expect(selected).not.toContain('metal-gear');
    expect(selected).not.toContain('band');
  });
});
