import { describe, expect, test } from 'bun:test';
import {
  computePlayerDifficulty,
  computeTagUpdates,
  decayedScore,
  difficultyMultiplier,
  resolvePlayerDifficulty,
} from '../utils/tagScoring';

describe('computeTagUpdates', () => {
  test('correct answer adds full game points to each tag', () => {
    const updates = computeTagUpdates(['Zelda', 'Nintendo'], true, 850);
    expect(updates).toEqual([
      { tag: 'zelda', delta: 850 },
      { tag: 'nintendo', delta: 850 },
    ]);
  });

  test('wrong answer applies -200 per tag', () => {
    const updates = computeTagUpdates(['gaming', 'trivia'], false, 0);
    expect(updates).toEqual([
      { tag: 'gaming', delta: -200 },
      { tag: 'trivia', delta: -200 },
    ]);
  });

  test('timeout treated as wrong answer (0 points, isCorrect=false)', () => {
    const updates = computeTagUpdates(['history'], false, 0);
    expect(updates).toEqual([{ tag: 'history', delta: -200 }]);
  });

  test('normalizes tags to lowercase and trims whitespace', () => {
    const updates = computeTagUpdates(['  ZELDA  ', 'Nintendo'], true, 500);
    expect(updates).toEqual([
      { tag: 'zelda', delta: 500 },
      { tag: 'nintendo', delta: 500 },
    ]);
  });

  test('empty tags array returns empty updates', () => {
    const updates = computeTagUpdates([], true, 1000);
    expect(updates).toEqual([]);
  });

  test('filters out empty/whitespace-only tags', () => {
    const updates = computeTagUpdates(['valid', '', '  '], true, 500);
    expect(updates).toEqual([{ tag: 'valid', delta: 500 }]);
  });
});

describe('decayedScore', () => {
  test('no games since update returns raw score', () => {
    expect(decayedScore(1000, 0)).toBe(1000);
  });

  test('after half-life games, score is halved', () => {
    expect(decayedScore(1000, 10)).toBeCloseTo(500, 5);
  });

  test('after two half-lives, score is quartered', () => {
    expect(decayedScore(1000, 20)).toBeCloseTo(250, 5);
  });

  test('negative scores decay toward zero', () => {
    expect(decayedScore(-400, 10)).toBeCloseTo(-200, 5);
  });

  test('custom half-life works', () => {
    expect(decayedScore(1000, 5, 5)).toBeCloseTo(500, 5);
  });
});

describe('computePlayerDifficulty', () => {
  test('no tag data returns default 2.5', () => {
    const scores = new Map<string, number>();
    expect(computePlayerDifficulty(scores, ['gaming'])).toBe(2.5);
  });

  test('no matching tags returns default 2.5', () => {
    const scores = new Map([['science', 3000]]);
    expect(computePlayerDifficulty(scores, ['gaming'])).toBe(2.5);
  });

  test('high positive score maps to low difficulty (easy)', () => {
    const scores = new Map([['gaming', 5000]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(1); // Player is strong -> easy
  });

  test('negative score maps to high difficulty (hard)', () => {
    const scores = new Map([['gaming', -2000]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(5); // Player is weak -> hard
  });

  test('zero score maps to mid-range difficulty', () => {
    const scores = new Map([['gaming', 0]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    // (0 + 2000) / 7000 ≈ 0.286 -> 5 - 0.286*4 ≈ 3.857
    expect(difficulty).toBeCloseTo(3.857, 2);
  });

  test('averages across multiple matching tags', () => {
    const scores = new Map([
      ['zelda', 5000], // max -> easy
      ['trivia', -2000], // min -> hard
    ]);
    const difficulty = computePlayerDifficulty(scores, ['zelda', 'trivia']);
    // Average of 5000 and -2000 = 1500
    // normalized = (1500+2000)/7000 = 3500/7000 = 0.5
    // difficulty = 5 - 0.5*4 = 3.0
    expect(difficulty).toBeCloseTo(3.0, 5);
  });

  test('case-insensitive tag matching', () => {
    const scores = new Map([['gaming', 3000]]);
    const difficulty = computePlayerDifficulty(scores, ['GAMING']);
    expect(difficulty).toBeLessThan(2.5); // Should match and show easy
  });

  test('clamps extreme scores', () => {
    const scores = new Map([['gaming', 100000]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(1); // Clamped to easiest
  });
});

describe('difficultyMultiplier', () => {
  test('difficulty 1 (easy) gives 0.95x', () => {
    expect(difficultyMultiplier(1)).toBeCloseTo(0.95, 5);
  });

  test('difficulty 5 (hard) gives 1.10x', () => {
    expect(difficultyMultiplier(5)).toBeCloseTo(1.1, 5);
  });

  test('difficulty 2.5 (default) gives ~1.006x', () => {
    // 0.95 + (2.5 - 1) * 0.0375 = 0.95 + 0.05625 = 1.00625
    expect(difficultyMultiplier(2.5)).toBeCloseTo(1.00625, 5);
  });

  test('clamped below 0.95', () => {
    expect(difficultyMultiplier(0)).toBe(0.95);
  });

  test('clamped above 1.10', () => {
    expect(difficultyMultiplier(10)).toBe(1.1);
  });
});

describe('resolvePlayerDifficulty', () => {
  test('no static difficulty returns dynamic', () => {
    expect(resolvePlayerDifficulty('Alice', null, 3.5)).toBe(3.5);
  });

  test('static override takes precedence', () => {
    const staticDiff = { Alice: 4.0, Bob: 2.0 };
    expect(resolvePlayerDifficulty('Alice', staticDiff, 3.0)).toBe(4.0);
  });

  test('case-insensitive name matching', () => {
    const staticDiff = { alice: 4.0 };
    expect(resolvePlayerDifficulty('ALICE', staticDiff, 3.0)).toBe(4.0);
  });

  test('falls back to default key if name not found', () => {
    const staticDiff = { default: 3.0 };
    expect(resolvePlayerDifficulty('Unknown', staticDiff, 1.0)).toBe(3.0);
  });

  test('falls back to dynamic if no match and no default', () => {
    const staticDiff = { Bob: 4.0 };
    expect(resolvePlayerDifficulty('Alice', staticDiff, 2.5)).toBe(2.5);
  });
});
