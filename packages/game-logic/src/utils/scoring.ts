const BASE_POINTS = 100;
const MAX_TIME_BONUS = 900; // Total max = 1000 points

/**
 * Calculate score for a single answer
 * @param isCorrect - Whether the answer was correct
 * @param responseTimeMs - Server-calculated response time in milliseconds
 * @param timeLimitSeconds - Question time limit in seconds
 * @returns Points earned (0 if incorrect)
 */
export function calculateScore(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimitSeconds: number
): number {
  if (!isCorrect) return 0;

  const timeLimitMs = timeLimitSeconds * 1000;
  // timeRatio: 1.0 for instant answer, 0.0 for answering at time limit
  const timeRatio = Math.max(0, 1 - responseTimeMs / timeLimitMs);
  const timeBonus = Math.floor(MAX_TIME_BONUS * timeRatio);

  return BASE_POINTS + timeBonus;
}

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
