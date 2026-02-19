/** Elo-style tag scoring constants */
export const ELO_BASELINE = 1500;
export const ELO_K = 32;
export const ELO_SCALE = 400;

export interface TagScoreUpdate {
  tag: string;
  delta: number;
}

/**
 * Compute Elo-style tag score updates after a player answers a question.
 * Delta magnitude reflects how surprising the outcome was:
 *   - Strong player gets easy question wrong = large drop
 *   - Weak player gets hard question right = large gain
 */
export function computeTagUpdates(
  questionTags: string[],
  isCorrect: boolean,
  playerTagScores: Map<string, number>,
): TagScoreUpdate[] {
  const normalizedTags = questionTags
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0);

  const actual = isCorrect ? 1 : 0;

  return normalizedTags.map((tag) => {
    const playerRating = playerTagScores.get(tag) ?? ELO_BASELINE;
    const expected = 1 / (1 + Math.exp(-(playerRating - ELO_BASELINE) / ELO_SCALE));
    const delta = ELO_K * (actual - expected);
    return { tag, delta };
  });
}

/**
 * Apply exponential confidence decay to a raw tag score.
 * Decays toward ELO_BASELINE — a player who hasn't played in a while
 * gradually returns to "unknown" (1500) rather than to zero.
 */
export function decayedScore(
  rawScore: number,
  gamesPlayedSinceUpdate: number,
  halfLife = 10,
): number {
  return ELO_BASELINE + (rawScore - ELO_BASELINE) * 0.5 ** (gamesPlayedSinceUpdate / halfLife);
}

/**
 * Compute per-player difficulty for a question based on their tag scores.
 * Returns a value on a 1-5 scale:
 *   1 = easy (player is strong in these tags)
 *   5 = hard (player is weak/unknown in these tags)
 *   3 = default (no tag data / average Elo)
 */
export function computePlayerDifficulty(
  playerTagScores: Map<string, number>,
  questionTags: string[],
): number {
  const normalizedTags = questionTags.map((t) => t.toLowerCase().trim());
  const relevantScores = normalizedTags
    .map((tag) => playerTagScores.get(tag))
    .filter((s): s is number => s !== undefined);

  if (relevantScores.length === 0) return 3;

  const avgScore = relevantScores.reduce((a, b) => a + b, 0) / relevantScores.length;

  // Elo range [1100, 1900] maps to difficulty [5, 1]
  const normalized = Math.max(0, Math.min(1, (avgScore - 1100) / 800));
  return 5 - normalized * 4;
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
