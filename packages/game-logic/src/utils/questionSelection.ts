import { computePlayerDifficulty } from './tagScoring';

// ── Minimal interface — decouples game-logic from DB schema ──────────

export interface SelectableQuestion {
  id: string;
  tags: string[];
  difficulty?: number;
  playerDifficulty?: Record<string, number> | null;
}

// ── Pool building ────────────────────────────────────────────────────

export interface PoolBuildContext {
  nRounds: number;
  playerTagScores?: Map<string, Map<string, number>>; // profileId -> tag -> score
}

/**
 * Curate a question pool from available questions.
 *
 * - With tag scores: half targets collective player strengths, half diverse.
 * - Without tag scores (cold start): maximise tag diversity.
 * - Target pool size: ~3× nRounds, capped at input length.
 * - Returns a shuffled pool (selection order is the per-round picker's job).
 */
export function buildQuestionPool<T extends SelectableQuestion>(
  allQuestions: T[],
  context: PoolBuildContext,
  random: () => number = Math.random,
): T[] {
  const { nRounds, playerTagScores } = context;

  if (allQuestions.length === 0) return [];
  if (allQuestions.length <= nRounds) return shuffle([...allQuestions], random);

  const targetSize = Math.min(nRounds * 3, allQuestions.length);

  // Check whether we have meaningful tag data
  const profiledWithData = playerTagScores
    ? [...playerTagScores.values()].filter((m) => m.size > 0).length
    : 0;
  const useStrengths = profiledWithData > 0;

  let pool: T[];

  if (useStrengths) {
    const strengthCount = Math.floor(targetSize / 2);
    const diverseCount = targetSize - strengthCount;

    // Score each question by average tag strength across profiled players
    const scored = allQuestions.map((q) => {
      if (q.tags.length === 0) return { question: q, strengthScore: 0 };

      let totalScore = 0;
      let playerCount = 0;

      for (const [, tagScores] of playerTagScores!) {
        if (tagScores.size === 0) continue;
        const relevant = q.tags
          .map((t) => tagScores.get(t.toLowerCase().trim()))
          .filter((s): s is number => s !== undefined);
        if (relevant.length > 0) {
          totalScore += relevant.reduce((a, b) => a + b, 0) / relevant.length;
          playerCount++;
        }
      }

      return {
        question: q,
        strengthScore: playerCount > 0 ? totalScore / playerCount : 0,
      };
    });

    scored.sort((a, b) => b.strengthScore - a.strengthScore);
    const strengthBucket = scored.slice(0, strengthCount).map((s) => s.question);
    const strengthIds = new Set(strengthBucket.map((q) => q.id));

    const remaining = allQuestions.filter((q) => !strengthIds.has(q.id));
    const diverseBucket = selectDiverse(remaining, diverseCount, random);

    pool = [...strengthBucket, ...diverseBucket];
  } else {
    pool = selectDiverse(allQuestions, targetSize, random);
  }

  return shuffle(pool, random);
}

/**
 * Greedy tag-diversity selector: pick questions that add the most new tags.
 * Among ties, prefer questions whose difficulty level is underrepresented
 * in the pool so far (soft spread bias). Final ties broken randomly.
 */
function selectDiverse<T extends SelectableQuestion>(
  questions: T[],
  count: number,
  random: () => number,
): T[] {
  if (questions.length <= count) return [...questions];

  const selected: T[] = [];
  const usedTags = new Set<string>();
  const remaining = [...questions];
  // Track how many questions of each difficulty level (1-5) have been selected
  const difficultyCounts = new Map<number, number>();

  while (selected.length < count && remaining.length > 0) {
    let bestNewTags = -1;
    const candidates: number[] = [];

    for (let i = 0; i < remaining.length; i++) {
      const newTags = remaining[i].tags.filter((t) => !usedTags.has(t.toLowerCase().trim())).length;
      if (newTags > bestNewTags) {
        bestNewTags = newTags;
        candidates.length = 0;
        candidates.push(i);
      } else if (newTags === bestNewTags) {
        candidates.push(i);
      }
    }

    // Among tag-coverage ties, prefer underrepresented difficulty levels
    let pickIdx: number;
    if (candidates.length > 1) {
      let lowestCount = Number.POSITIVE_INFINITY;
      const diffTied: number[] = [];

      for (const idx of candidates) {
        const diff = remaining[idx].difficulty ?? 3;
        const count = difficultyCounts.get(diff) ?? 0;
        if (count < lowestCount) {
          lowestCount = count;
          diffTied.length = 0;
          diffTied.push(idx);
        } else if (count === lowestCount) {
          diffTied.push(idx);
        }
      }

      pickIdx = diffTied[Math.floor(random() * diffTied.length)];
    } else {
      pickIdx = candidates[0];
    }

    const picked = remaining[pickIdx];
    selected.push(picked);
    for (const tag of picked.tags) {
      usedTags.add(tag.toLowerCase().trim());
    }
    const pickedDiff = picked.difficulty ?? 3;
    difficultyCounts.set(pickedDiff, (difficultyCounts.get(pickedDiff) ?? 0) + 1);
    remaining.splice(pickIdx, 1);
  }

  return selected;
}

// ── Per-round selection ──────────────────────────────────────────────

export interface RoundSelectionPlayer {
  profileId: string;
  name: string;
  currentScore: number;
}

export interface RoundSelectionContext {
  players: RoundSelectionPlayer[];
  playerTagScores: Map<string, Map<string, number>>; // profileId -> tag -> decayed score
  roundIndex?: number; // 0-based current round; omit for full catch-up (backward compat)
  totalRounds?: number;
}

/**
 * Select the next question dynamically based on current game state.
 *
 * Phase ramp: early rounds are mostly random, catch-up influence grows to
 * 100 % at 75 % through the game. When roundIndex/totalRounds are omitted
 * the function uses full catch-up (backward compatible with existing callers).
 *
 * Falls back to random when:
 * - All players are tied or it's the first round
 * - No players have profiles / tag data
 * - Only one question remains
 * - Single player (no catch-up possible)
 */
export function selectNextQuestion<T extends SelectableQuestion>(
  remainingPool: T[],
  context: RoundSelectionContext,
  random: () => number = Math.random,
): T {
  if (remainingPool.length <= 1) return remainingPool[0];

  const { players, playerTagScores, roundIndex, totalRounds } = context;

  // Phase ramp — default to full catch-up for backward compatibility
  let catchUpInfluence: number;
  if (roundIndex !== undefined && totalRounds !== undefined && totalRounds > 0) {
    catchUpInfluence = Math.min(1, Math.max(0, roundIndex / (totalRounds * 0.75)));
  } else {
    catchUpInfluence = 1;
  }

  // Single player or zero influence → random
  if (players.length <= 1 || catchUpInfluence === 0) {
    return remainingPool[Math.floor(random() * remainingPool.length)];
  }

  // Identify trailing players (below average score)
  const avgScore = players.reduce((s, p) => s + p.currentScore, 0) / players.length;
  const trailingPlayers = players.filter((p) => p.currentScore < avgScore);

  // All tied, first round, or everyone trailing → random
  if (trailingPlayers.length === 0 || trailingPlayers.length === players.length) {
    return remainingPool[Math.floor(random() * remainingPool.length)];
  }

  const leadingPlayers = players.filter((p) => p.currentScore >= avgScore);

  // Score each candidate question
  const scored = remainingPool.map((q) => {
    const tags = q.tags ?? [];

    let catchUpScore = 0;
    if (tags.length > 0) {
      // How EASY is this question for trailing players?
      const trailingEasiness = trailingPlayers.map((p) => {
        const tagScores = playerTagScores.get(p.profileId) ?? new Map<string, number>();
        const difficulty = computePlayerDifficulty(tagScores, tags);
        return 5 - difficulty; // Invert: 5=very easy, 0=very hard
      });

      // How HARD is this question for leading players?
      const leadingHardness = leadingPlayers.map((p) => {
        const tagScores = playerTagScores.get(p.profileId) ?? new Map<string, number>();
        const difficulty = computePlayerDifficulty(tagScores, tags);
        return difficulty; // Higher = harder for leaders
      });

      const avgTrailingEasiness =
        trailingEasiness.reduce((a, b) => a + b, 0) / trailingEasiness.length;
      const avgLeadingHardness =
        leadingHardness.reduce((a, b) => a + b, 0) / leadingHardness.length;

      // 70% weight on trailing easiness, 30% on leading hardness
      catchUpScore = avgTrailingEasiness * 0.7 + avgLeadingHardness * 0.3;
    }

    // Blend catch-up with randomness based on phase ramp
    const randomScore = random();
    const blendedScore = catchUpInfluence * catchUpScore + (1 - catchUpInfluence) * randomScore;

    return { question: q, score: blendedScore };
  });

  // Weighted random from top 5 candidates
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, Math.min(5, scored.length));

  const totalWeight = topCandidates.reduce((s, c) => s + Math.max(c.score, 0.1), 0);
  let roll = random() * totalWeight;
  for (const candidate of topCandidates) {
    roll -= Math.max(candidate.score, 0.1);
    if (roll <= 0) return candidate.question;
  }

  return topCandidates[0].question;
}

// ── Helpers ──────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
