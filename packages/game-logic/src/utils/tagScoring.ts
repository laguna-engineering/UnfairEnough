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
 * Blend absolute question difficulty with Elo-derived per-player difficulty.
 * Returns the absolute difficulty when no Elo data is available (cold start).
 */
export function computeEffectiveDifficulty(
  absoluteDifficulty: number,
  eloDifficulty: number | null,
): number {
  if (eloDifficulty == null) return absoluteDifficulty;
  return 0.5 * absoluteDifficulty + 0.5 * eloDifficulty;
}

/**
 * Map difficulty (1-5) to a score multiplier.
 * Intentionally small range [0.95, 1.10] — question selection is the main catch-up lever.
 */
export function difficultyMultiplier(difficulty: number): number {
  const multiplier = 0.95 + (difficulty - 1) * 0.0375;
  return Math.max(0.95, Math.min(1.1, multiplier));
}

/** Reserved `playerDifficulty` key: the value everyone unnamed falls back to. */
const DEFAULT_DIFFICULTY_KEY = 'default';

/**
 * `playerDifficulty` reaches us as `Record<string, number>`, but nothing on the
 * way in proves the values are numbers — the importer casts the parsed YAML
 * straight across. A string or null here would sail through difficultyMultiplier
 * and come out NaN, turning that player's score into NaN for the round, so an
 * unusable override is ignored rather than trusted.
 */
function isUsableDifficulty(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Resolve effective difficulty: a static YAML override takes precedence over the
 * dynamic tag-computed value, falling back to the reserved `default` key.
 *
 * Keys are profile names matched case-insensitively, which makes this a content
 * authoring convenience and *not* an identity check — the name is whatever the
 * player typed on the join screen, so anyone willing to type "Alice" is treated
 * as Alice here. Keep that in mind before wiring anything that matters to it.
 */
export function resolvePlayerDifficulty(
  playerName: string,
  staticDifficulty: Record<string, number> | null,
  dynamicDifficulty: number,
): number {
  if (!staticDifficulty) return dynamicDifficulty;

  const lowerName = playerName.trim().toLowerCase();
  // `default` is the fallback, so it is not available as a player's own key —
  // a player actually called "default" gets the fallback, not a personal override.
  const matchedKey =
    lowerName === DEFAULT_DIFFICULTY_KEY
      ? undefined
      : Object.keys(staticDifficulty).find(
          (k) => k.trim().toLowerCase() === lowerName && k !== DEFAULT_DIFFICULTY_KEY,
        );

  const override = matchedKey === undefined ? undefined : staticDifficulty[matchedKey];
  if (isUsableDifficulty(override)) return override;

  const fallback = staticDifficulty[DEFAULT_DIFFICULTY_KEY];
  if (isUsableDifficulty(fallback)) return fallback;

  return dynamicDifficulty;
}
