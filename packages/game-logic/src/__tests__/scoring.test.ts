import { describe, expect, test } from 'bun:test';
import {
  BASE_POINTS,
  calculateScore,
  computeCatchUpInfluence,
  computeTimeBonusMultiplier,
  MAX_TIME_BONUS,
} from '../utils/scoring';

// ── calculateScore ──────────────────────────────────────────────────

describe('calculateScore', () => {
  const timeLimit = 15; // seconds

  test('wrong answer returns zero for both fields', () => {
    const result = calculateScore(false, 2000, timeLimit);
    expect(result).toEqual({ basePoints: 0, timeBonus: 0 });
  });

  test('instant correct answer gives max time bonus', () => {
    const result = calculateScore(true, 0, timeLimit);
    expect(result).toEqual({ basePoints: BASE_POINTS, timeBonus: MAX_TIME_BONUS });
  });

  test('half-time correct answer gives half time bonus', () => {
    const result = calculateScore(true, 7500, timeLimit);
    expect(result).toEqual({ basePoints: 100, timeBonus: 200 });
  });

  test('answer at time limit gives zero time bonus', () => {
    const result = calculateScore(true, 15000, timeLimit);
    expect(result).toEqual({ basePoints: 100, timeBonus: 0 });
  });

  test('answer past time limit gives zero time bonus', () => {
    const result = calculateScore(true, 20000, timeLimit);
    expect(result).toEqual({ basePoints: 100, timeBonus: 0 });
  });

  test('max possible score is BASE_POINTS + MAX_TIME_BONUS = 500', () => {
    const { basePoints, timeBonus } = calculateScore(true, 0, timeLimit);
    expect(basePoints + timeBonus).toBe(500);
  });
});

// ── computeCatchUpInfluence ─────────────────────────────────────────

describe('computeCatchUpInfluence', () => {
  test('round 0 returns 0', () => {
    expect(computeCatchUpInfluence(0, 10)).toBe(0);
  });

  test('at 75% of total rounds returns 1.0', () => {
    expect(computeCatchUpInfluence(7.5, 10)).toBeCloseTo(1.0, 5);
  });

  test('past 75% is clamped at 1.0', () => {
    expect(computeCatchUpInfluence(9, 10)).toBe(1);
  });

  test('mid-game returns proportional value', () => {
    // round 3 of 10 → 3 / 7.5 = 0.4
    expect(computeCatchUpInfluence(3, 10)).toBeCloseTo(0.4, 5);
  });

  test('undefined roundIndex returns 1 (backward compat)', () => {
    expect(computeCatchUpInfluence(undefined, 10)).toBe(1);
  });

  test('undefined totalRounds returns 1 (backward compat)', () => {
    expect(computeCatchUpInfluence(5, undefined)).toBe(1);
  });

  test('both undefined returns 1 (backward compat)', () => {
    expect(computeCatchUpInfluence(undefined, undefined)).toBe(1);
  });

  test('totalRounds = 0 returns 1 (guard)', () => {
    expect(computeCatchUpInfluence(0, 0)).toBe(1);
  });
});

// ── computeTimeBonusMultiplier ──────────────────────────────────────

describe('computeTimeBonusMultiplier', () => {
  test('single player returns 1.0', () => {
    expect(computeTimeBonusMultiplier(100, [100])).toBe(1);
  });

  test('all tied returns 1.0', () => {
    expect(computeTimeBonusMultiplier(500, [500, 500, 500])).toBeCloseTo(1.0, 5);
  });

  test('last place at full catch-up returns 1.3', () => {
    // Full catch-up: omit roundIndex/totalRounds → influence=1
    const result = computeTimeBonusMultiplier(0, [0, 500, 1000]);
    expect(result).toBeCloseTo(1.3, 5);
  });

  test('first place at full catch-up returns 0.7', () => {
    const result = computeTimeBonusMultiplier(1000, [0, 500, 1000]);
    expect(result).toBeCloseTo(0.7, 5);
  });

  test('middle of pack at full catch-up returns ~1.0', () => {
    const result = computeTimeBonusMultiplier(500, [0, 500, 1000]);
    expect(result).toBeCloseTo(1.0, 5);
  });

  test('round 1 (catchUpInfluence=0) returns 1.0 for everyone', () => {
    // round 0, totalRounds 10 → influence=0
    expect(computeTimeBonusMultiplier(0, [0, 500, 1000], 0, 10)).toBeCloseTo(1.0, 5);
    expect(computeTimeBonusMultiplier(1000, [0, 500, 1000], 0, 10)).toBeCloseTo(1.0, 5);
  });

  test('half influence returns blended values', () => {
    // round 3.75 of 10 → influence = 3.75/7.5 = 0.5
    const last = computeTimeBonusMultiplier(0, [0, 1000], 3.75, 10);
    // targetMultiplier for last = 1.3, blended = 1.0 + 0.5*(1.3-1.0) = 1.15
    expect(last).toBeCloseTo(1.15, 5);

    const first = computeTimeBonusMultiplier(1000, [0, 1000], 3.75, 10);
    // targetMultiplier for first = 0.7, blended = 1.0 + 0.5*(0.7-1.0) = 0.85
    expect(first).toBeCloseTo(0.85, 5);
  });

  test('two players: trailing gets 1.3, leading gets 0.7 at full influence', () => {
    expect(computeTimeBonusMultiplier(100, [100, 500])).toBeCloseTo(1.3, 5);
    expect(computeTimeBonusMultiplier(500, [100, 500])).toBeCloseTo(0.7, 5);
  });
});

// ── Integration: 5-round game simulation ────────────────────────────

describe('integration: 5-round scoring', () => {
  test('trailing player accumulates catch-up bonus over rounds', () => {
    const totalRounds = 5;
    const timeLimit = 15;

    // Two players, same response time every round (5s → timeRatio=2/3)
    const responseTimeMs = 5000;
    const scores = [0, 0]; // [leader, trailer]

    const leaderBonuses: number[] = [];
    const trailerBonuses: number[] = [];

    for (let round = 0; round < totalRounds; round++) {
      const preRoundScores = [...scores];

      // Leader always correct
      const { basePoints: lBP, timeBonus: lTB } = calculateScore(true, responseTimeMs, timeLimit);
      const lMult = computeTimeBonusMultiplier(scores[0], preRoundScores, round, totalRounds);
      leaderBonuses.push(lMult);
      scores[0] += Math.round(lBP + lTB * lMult);

      // Trailer: correct except round 1 (misses one)
      const trailerCorrect = round !== 1;
      const { basePoints: tBP, timeBonus: tTB } = calculateScore(
        trailerCorrect,
        responseTimeMs,
        timeLimit,
      );
      const tMult = computeTimeBonusMultiplier(scores[1], preRoundScores, round, totalRounds);
      trailerBonuses.push(tMult);
      scores[1] += Math.round(tBP + tTB * tMult);
    }

    // Round 0: both tied → both get 1.0
    expect(leaderBonuses[0]).toBeCloseTo(1.0, 3);
    expect(trailerBonuses[0]).toBeCloseTo(1.0, 3);

    // After round 1 (trailer missed), trailer falls behind.
    // From round 2 onward, trailer should get > 1.0 and leader < 1.0
    for (let r = 2; r < totalRounds; r++) {
      expect(trailerBonuses[r]).toBeGreaterThan(1.0);
      expect(leaderBonuses[r]).toBeLessThan(1.0);
    }

    // The trailer's bonus should increase over rounds as catch-up ramps
    expect(trailerBonuses[3]).toBeGreaterThan(trailerBonuses[2]);
  });
});
