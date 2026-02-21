export const BASE_POINTS = 100;
export const MAX_TIME_BONUS = 400; // Total max = 500 points

export interface ScoreBreakdown {
  basePoints: number;
  timeBonus: number;
}

/**
 * Calculate score for a single answer.
 * @returns { basePoints, timeBonus } — both 0 if incorrect
 */
export function calculateScore(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimitSeconds: number,
): ScoreBreakdown {
  if (!isCorrect) return { basePoints: 0, timeBonus: 0 };

  const timeLimitMs = timeLimitSeconds * 1000;
  // timeRatio: 1.0 for instant answer, 0.0 for answering at time limit
  const timeRatio = Math.max(0, 1 - responseTimeMs / timeLimitMs);
  const timeBonus = Math.floor(MAX_TIME_BONUS * timeRatio);

  return { basePoints: BASE_POINTS, timeBonus };
}

// ── Catch-up influence ──────────────────────────────────────────────

/**
 * Compute the catch-up influence factor based on game progress.
 * Ramps from 0 at round 0 to 1.0 at 75% through the game (clamped).
 * Returns 1 when params are omitted (backward compatibility).
 */
export function computeCatchUpInfluence(roundIndex?: number, totalRounds?: number): number {
  if (roundIndex === undefined || totalRounds === undefined || totalRounds <= 0) return 1;
  return Math.min(1, Math.max(0, roundIndex / (totalRounds * 0.75)));
}

// ── Time bonus multiplier ───────────────────────────────────────────

/**
 * Position-based time bonus multiplier.
 * Trailing players get up to 1.3x, leading players get down to 0.7x,
 * scaled by catchUpInfluence (early rounds → neutral 1.0).
 */
export function computeTimeBonusMultiplier(
  playerScore: number,
  allScores: number[],
  roundIndex?: number,
  totalRounds?: number,
): number {
  if (allScores.length <= 1) return 1;

  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const positionRatio =
    maxScore === minScore ? 0.5 : (playerScore - minScore) / (maxScore - minScore);
  const targetMultiplier = 1.3 - 0.6 * positionRatio;
  const catchUpInfluence = computeCatchUpInfluence(roundIndex, totalRounds);

  return 1.0 + catchUpInfluence * (targetMultiplier - 1.0);
}

// ── Ranking utilities ───────────────────────────────────────────────

export interface PlayerScore {
  id: string;
  name: string;
  score: number;
}

export interface RankedPlayer extends PlayerScore {
  rank: number;
}

/**
 * Rank players by score, handling ties (same score = same rank)
 */
export function rankPlayers(players: PlayerScore[]): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  let currentRank = 1;
  return sorted.map((player, index) => {
    // If this player has a lower score than the previous, update rank
    if (index > 0 && player.score < sorted[index - 1].score) {
      currentRank = index + 1;
    }
    return { ...player, rank: currentRank };
  });
}

/**
 * Get position suffix (1st, 2nd, 3rd, 4th, etc.)
 */
export function getPositionSuffix(position: number): string {
  if (position >= 11 && position <= 13) {
    return `${position}th`;
  }
  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}
