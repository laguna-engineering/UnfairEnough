import { describe, expect, test } from 'bun:test';
import {
  defaultGuessStep,
  FALSE_KEY,
  resolvePollWinners,
  TRUE_KEY,
  trueFalseCorrectKey,
  trueFalseOptions,
} from '../utils/questionTypes';

describe('resolvePollWinners', () => {
  test('a single option with the most votes wins alone', () => {
    expect(resolvePollWinners({ A: 5, B: 3, C: 1 })).toEqual(['A']);
  });

  test('a tie for the most votes returns every tied option (R12/AE4)', () => {
    const winners = resolvePollWinners({ A: 5, B: 5, C: 2 });
    expect(winners.sort()).toEqual(['A', 'B']);
  });

  test('no votes cast returns an empty array', () => {
    expect(resolvePollWinners({})).toEqual([]);
  });

  test('all-zero vote counts return an empty array', () => {
    expect(resolvePollWinners({ A: 0, B: 0 })).toEqual([]);
  });
});

describe('true/false helpers', () => {
  test('trueFalseCorrectKey maps "true" to TRUE_KEY and "false" to FALSE_KEY', () => {
    expect(trueFalseCorrectKey('true')).toBe(TRUE_KEY);
    expect(trueFalseCorrectKey('false')).toBe(FALSE_KEY);
  });

  test('trueFalseCorrectKey is case-insensitive', () => {
    expect(trueFalseCorrectKey('TRUE')).toBe(TRUE_KEY);
    expect(trueFalseCorrectKey('False')).toBe(FALSE_KEY);
  });

  test('trueFalseOptions returns the fallback True/False tiles', () => {
    expect(trueFalseOptions()).toEqual([
      { key: TRUE_KEY, text: 'True' },
      { key: FALSE_KEY, text: 'False' },
    ]);
  });
});

describe('defaultGuessStep', () => {
  test('a large range (0-100,000) steps by 1,000', () => {
    expect(defaultGuessStep(0, 100_000)).toBe(1000);
  });

  test('a small range (0-50) steps by 1', () => {
    expect(defaultGuessStep(0, 50)).toBe(1);
  });
});
