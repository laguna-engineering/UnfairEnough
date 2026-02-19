import { describe, expect, test } from 'bun:test';
import {
  computePlayerDifficulty,
  computeTagUpdates,
  decayedScore,
  difficultyMultiplier,
  ELO_BASELINE,
  ELO_K,
  resolvePlayerDifficulty,
} from '../utils/tagScoring';

describe('computeTagUpdates', () => {
  test('unknown tag (baseline) correct: delta = +K/2 = +16', () => {
    const scores = new Map<string, number>();
    const updates = computeTagUpdates(['gaming'], true, scores);
    expect(updates).toHaveLength(1);
    expect(updates[0].tag).toBe('gaming');
    expect(updates[0].delta).toBeCloseTo(16, 1);
  });

  test('unknown tag (baseline) wrong: delta = -K/2 = -16', () => {
    const scores = new Map<string, number>();
    const updates = computeTagUpdates(['gaming'], false, scores);
    expect(updates[0].delta).toBeCloseTo(-16, 1);
  });

  test('strong tag correct: small positive delta', () => {
    const scores = new Map([['gaming', 1700]]);
    const updates = computeTagUpdates(['gaming'], true, scores);
    // expected ≈ 0.622 → delta ≈ 32 * (1 - 0.622) ≈ 12.1
    expect(updates[0].delta).toBeGreaterThan(0);
    expect(updates[0].delta).toBeLessThan(16); // Less than baseline delta
  });

  test('strong tag wrong: large negative delta', () => {
    const scores = new Map([['gaming', 1700]]);
    const updates = computeTagUpdates(['gaming'], false, scores);
    // expected ≈ 0.622 → delta ≈ 32 * (0 - 0.622) ≈ -19.9
    expect(updates[0].delta).toBeLessThan(-16); // More than baseline penalty
  });

  test('weak tag correct: large positive delta', () => {
    const scores = new Map([['gaming', 1300]]);
    const updates = computeTagUpdates(['gaming'], true, scores);
    // expected ≈ 0.378 → delta ≈ 32 * (1 - 0.378) ≈ 19.9
    expect(updates[0].delta).toBeGreaterThan(16); // More than baseline gain
  });

  test('weak tag wrong: small negative delta', () => {
    const scores = new Map([['gaming', 1300]]);
    const updates = computeTagUpdates(['gaming'], false, scores);
    // expected ≈ 0.378 → delta ≈ 32 * (0 - 0.378) ≈ -12.1
    expect(updates[0].delta).toBeLessThan(0);
    expect(updates[0].delta).toBeGreaterThan(-16); // Less than baseline penalty
  });

  test('applies to each tag independently', () => {
    const scores = new Map([
      ['zelda', 1700],
      ['nintendo', 1300],
    ]);
    const updates = computeTagUpdates(['Zelda', 'Nintendo'], true, scores);
    expect(updates).toHaveLength(2);
    // Zelda (strong) should get smaller gain than Nintendo (weak)
    const zeldaDelta = updates.find((u) => u.tag === 'zelda')!.delta;
    const nintendoDelta = updates.find((u) => u.tag === 'nintendo')!.delta;
    expect(nintendoDelta).toBeGreaterThan(zeldaDelta);
  });

  test('normalizes tags to lowercase and trims whitespace', () => {
    const scores = new Map<string, number>();
    const updates = computeTagUpdates(['  ZELDA  ', 'Nintendo'], true, scores);
    expect(updates).toEqual([
      { tag: 'zelda', delta: expect.any(Number) },
      { tag: 'nintendo', delta: expect.any(Number) },
    ]);
  });

  test('empty tags array returns empty updates', () => {
    const updates = computeTagUpdates([], true, new Map());
    expect(updates).toEqual([]);
  });

  test('filters out empty/whitespace-only tags', () => {
    const updates = computeTagUpdates(['valid', '', '  '], true, new Map());
    expect(updates).toHaveLength(1);
    expect(updates[0].tag).toBe('valid');
  });

  test('deltas sum to zero at baseline rating', () => {
    const scores = new Map([['gaming', ELO_BASELINE]]);
    const correctDelta = computeTagUpdates(['gaming'], true, scores)[0].delta;
    const wrongDelta = computeTagUpdates(['gaming'], false, scores)[0].delta;
    expect(correctDelta + wrongDelta).toBeCloseTo(0, 5);
  });

  test('extreme high rating: correct gives small gain, wrong gives near -K', () => {
    const scores = new Map([['gaming', 2500]]);
    const correctDelta = computeTagUpdates(['gaming'], true, scores)[0].delta;
    const wrongDelta = computeTagUpdates(['gaming'], false, scores)[0].delta;
    expect(correctDelta).toBeLessThan(5); // Very small gain
    expect(correctDelta).toBeGreaterThan(0);
    expect(wrongDelta).toBeLessThan(-ELO_K + 5); // Near -32
  });
});

describe('decayedScore', () => {
  test('no games since update returns raw score', () => {
    expect(decayedScore(1800, 0)).toBe(1800);
  });

  test('after half-life games, score decays halfway to baseline', () => {
    // raw=1800, baseline=1500, after half-life: 1500 + (1800-1500)*0.5 = 1650
    expect(decayedScore(1800, 10)).toBeCloseTo(1650, 5);
  });

  test('after two half-lives, score decays 75% to baseline', () => {
    // raw=1800, baseline=1500, after 2 half-lives: 1500 + (1800-1500)*0.25 = 1575
    expect(decayedScore(1800, 20)).toBeCloseTo(1575, 5);
  });

  test('below-baseline scores decay upward toward baseline', () => {
    // raw=1200, baseline=1500, after half-life: 1500 + (1200-1500)*0.5 = 1350
    expect(decayedScore(1200, 10)).toBeCloseTo(1350, 5);
  });

  test('baseline score stays at baseline regardless of decay', () => {
    expect(decayedScore(ELO_BASELINE, 10)).toBe(ELO_BASELINE);
    expect(decayedScore(ELO_BASELINE, 100)).toBe(ELO_BASELINE);
  });

  test('custom half-life works', () => {
    // raw=1800, half-life=5, 5 games: 1500 + 300*0.5 = 1650
    expect(decayedScore(1800, 5, 5)).toBeCloseTo(1650, 5);
  });
});

describe('computePlayerDifficulty', () => {
  test('no tag data returns default 3', () => {
    const scores = new Map<string, number>();
    expect(computePlayerDifficulty(scores, ['gaming'])).toBe(3);
  });

  test('no matching tags returns default 3', () => {
    const scores = new Map([['science', 1700]]);
    expect(computePlayerDifficulty(scores, ['gaming'])).toBe(3);
  });

  test('high Elo (1900) maps to difficulty 1 (easy)', () => {
    const scores = new Map([['gaming', 1900]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(1);
  });

  test('low Elo (1100) maps to difficulty 5 (hard)', () => {
    const scores = new Map([['gaming', 1100]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(5);
  });

  test('baseline Elo (1500) maps to difficulty 3', () => {
    const scores = new Map([['gaming', ELO_BASELINE]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(3);
  });

  test('averages across multiple matching tags', () => {
    const scores = new Map([
      ['zelda', 1900],
      ['trivia', 1100],
    ]);
    const difficulty = computePlayerDifficulty(scores, ['zelda', 'trivia']);
    // Average = 1500 → normalized = (1500-1100)/800 = 0.5 → difficulty = 3
    expect(difficulty).toBeCloseTo(3.0, 5);
  });

  test('case-insensitive tag matching', () => {
    const scores = new Map([['gaming', 1700]]);
    const difficulty = computePlayerDifficulty(scores, ['GAMING']);
    expect(difficulty).toBeLessThan(3); // Strong → easy
  });

  test('clamps extreme scores above range', () => {
    const scores = new Map([['gaming', 2500]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(1); // Clamped to easiest
  });

  test('clamps extreme scores below range', () => {
    const scores = new Map([['gaming', 500]]);
    const difficulty = computePlayerDifficulty(scores, ['gaming']);
    expect(difficulty).toBe(5); // Clamped to hardest
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
