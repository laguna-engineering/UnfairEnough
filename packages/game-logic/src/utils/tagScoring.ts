const WRONG_PENALTY = -200;

export interface TagScoreUpdate {
  tag: string;
  delta: number;
}

/**
 * Compute tag score updates after a player answers a question.
 * Each tag on the question gets the full score (correct) or a fixed penalty (incorrect/timeout).
 */
export function computeTagUpdates(
  questionTags: string[],
  isCorrect: boolean,
  gamePointsEarned: number,
): TagScoreUpdate[] {
  const normalizedTags = questionTags
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0);

  return normalizedTags.map((tag) => ({
    tag,
    delta: isCorrect ? gamePointsEarned : WRONG_PENALTY,
  }));
}

/**
 * Apply exponential confidence decay to a raw tag score.
 * Recent performance matters more — after `halfLife` games, old data contributes ~50%.
 */
export function decayedScore(
  rawScore: number,
  gamesPlayedSinceUpdate: number,
  halfLife = 10,
): number {
  return rawScore * 0.5 ** (gamesPlayedSinceUpdate / halfLife);
}

/**
 * Compute per-player difficulty for a question based on their tag scores.
 * Returns a value on a 1-5 scale:
 *   1 = easy (player is strong in these tags)
 *   5 = hard (player is weak/unknown in these tags)
 *   2.5 = default (no tag data)
 */
export function computePlayerDifficulty(
  playerTagScores: Map<string, number>,
  questionTags: string[],
): number {
  const normalizedTags = questionTags.map((t) => t.toLowerCase().trim());
  const relevantScores = normalizedTags
    .map((tag) => playerTagScores.get(tag))
    .filter((s): s is number => s !== undefined);

  if (relevantScores.length === 0) return 2.5;

  const avgScore = relevantScores.reduce((a, b) => a + b, 0) / relevantScores.length;

  // Higher tag score = lower difficulty (player is good at this)
  // Score range roughly -2000 to +5000 based on typical play
  const normalized = Math.max(0, Math.min(1, (avgScore + 2000) / 7000));
  return 5 - normalized * 4; // Maps: high score -> 1 (easy), low score -> 5 (hard)
}

/**
 * Map difficulty (1-5) to a score multiplier.
 * Intentionally small range [0.95, 1.10] — question selection is the main catch-up lever.
 */
export function difficultyMultiplier(difficulty: number): number {
  const multiplier = 0.95 + (difficulty - 1) * 0.0375;
  return Math.max(0.95, Math.min(1.1, multiplier));
}

/**
 * Resolve effective difficulty: static YAML override takes precedence over dynamic tag-computed value.
 */
export function resolvePlayerDifficulty(
  playerName: string,
  staticDifficulty: Record<string, number> | null,
  dynamicDifficulty: number,
): number {
  if (!staticDifficulty) return dynamicDifficulty;

  const lowerName = playerName.toLowerCase();
  const matchedKey = Object.keys(staticDifficulty).find((k) => k.toLowerCase() === lowerName);

  if (matchedKey) return staticDifficulty[matchedKey];
  if (staticDifficulty.default !== undefined) return staticDifficulty.default;

  return dynamicDifficulty;
}
