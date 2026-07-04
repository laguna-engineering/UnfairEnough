import { computeCatchUpInfluence } from './scoring';
import { computePlayerDifficulty } from './tagScoring';

const normalizeTag = (t: string) => t.toLowerCase().trim();

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
          .map((t) => tagScores.get(normalizeTag(t)))
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
      const newTags = remaining[i].tags.filter((t) => !usedTags.has(normalizeTag(t))).length;
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
      usedTags.add(normalizeTag(tag));
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
  previousQuestionTags?: string[]; // tags of the last served question
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

  // ── Tag-avoidance filter ──────────────────────────────────
  // When all remaining candidates overlap (e.g. thematic single-tag sets),
  // the filter naturally falls back to the full pool — no special-casing needed.
  const { previousQuestionTags } = context;
  let pool = remainingPool;

  if (previousQuestionTags && previousQuestionTags.length > 0) {
    const prevTags = new Set(previousQuestionTags.map((t) => normalizeTag(t)));
    const filtered = remainingPool.filter(
      (q) => !q.tags.some((t) => prevTags.has(normalizeTag(t))),
    );
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  if (pool.length === 1) return pool[0];

  const { players, playerTagScores, roundIndex, totalRounds } = context;

  const catchUpInfluence = computeCatchUpInfluence(roundIndex, totalRounds);

  // Single player or zero influence → random
  if (players.length <= 1 || catchUpInfluence === 0) {
    return pool[Math.floor(random() * pool.length)];
  }

  // Identify trailing players (below average score)
  const avgScore = players.reduce((s, p) => s + p.currentScore, 0) / players.length;
  const trailingPlayers = players.filter((p) => p.currentScore < avgScore);

  // All tied, first round, or everyone trailing → random
  if (trailingPlayers.length === 0 || trailingPlayers.length === players.length) {
    return pool[Math.floor(random() * pool.length)];
  }

  const leadingPlayers = players.filter((p) => p.currentScore >= avgScore);

  // Score each candidate question
  const scored = pool.map((q) => {
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

// ── Cross-game de-duplication ─────────────────────────────────────────

/**
 * Remove questions served in recent games so consecutive games don't repeat them,
 * preserving the input order among the kept (unseen) questions.
 *
 * If too few unseen questions remain to fill `requestedCount`, the filter relaxes:
 * it adds back previously-served questions least-recently-served first, so the most
 * recently seen ones stay out the longest. This keeps selection working even when a
 * set pool is smaller than a game.
 *
 * @param recentlyServedIds Served question IDs, oldest→newest.
 */
export function filterRecentlyServedQuestions<T extends { id: string }>(
  pool: T[],
  requestedCount: number,
  recentlyServedIds: readonly string[],
): T[] {
  if (recentlyServedIds.length === 0) return pool;
  const recencyRank = new Map<string, number>();
  recentlyServedIds.forEach((id, i) => {
    recencyRank.set(id, i);
  });

  const unseen: T[] = [];
  const seen: T[] = [];
  for (const q of pool) {
    if (recencyRank.has(q.id)) seen.push(q);
    else unseen.push(q);
  }
  if (unseen.length >= requestedCount) return unseen;

  // Not enough unseen questions; add back the least-recently-served first.
  seen.sort((a, b) => (recencyRank.get(a.id) ?? 0) - (recencyRank.get(b.id) ?? 0));
  return unseen.concat(seen);
}

// ── Picture year balancing ───────────────────────────────────────────

/**
 * Max photo questions sharing the same correct-answer year that may appear in a
 * single game. Once players learn the year a photo was taken, another photo from
 * that same year is a near-giveaway, so we cap the repeats.
 */
export const MAX_PICTURES_PER_ANSWER_YEAR = 2;

interface DatedPictureQuestion {
  media?: { type: string } | null;
  options: readonly { key: string; text: string }[];
  correctAnswer: string;
}

/**
 * The 4-digit year of an image question's correct answer (e.g. "Novembre 2025"
 * → 2025), or null for anything that isn't a picture with a year answer — those
 * are never constrained.
 */
function pictureAnswerYear(q: DatedPictureQuestion): number | null {
  if (q.media?.type !== 'image') return null;
  const correct = q.options.find((o) => o.key === q.correctAnswer);
  const match = correct?.text.match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Move same-year picture overflow to the back so no more than `maxPerYear`
 * questions sharing a correct-answer year land in a game's front slots. Input
 * order is preserved among kept questions; overflow is appended (not dropped),
 * so a caller that slices `requestedCount` from the front still fills the game
 * when the capped pool would otherwise be too small.
 *
 * Non-picture questions (and pictures without a year answer) are never limited.
 */
export function limitPicturesPerAnswerYear<T extends DatedPictureQuestion>(
  pool: T[],
  maxPerYear = MAX_PICTURES_PER_ANSWER_YEAR,
): T[] {
  const counts = new Map<number, number>();
  const kept: T[] = [];
  const overflow: T[] = [];
  for (const q of pool) {
    const year = pictureAnswerYear(q);
    if (year === null) {
      kept.push(q);
      continue;
    }
    const n = counts.get(year) ?? 0;
    if (n < maxPerYear) {
      counts.set(year, n + 1);
      kept.push(q);
    } else {
      overflow.push(q);
    }
  }
  return overflow.length === 0 ? kept : [...kept, ...overflow];
}

/**
 * Drop candidates whose correct-answer year has already been served `maxPerYear`
 * times this game, so per-round (adaptive / meta) selection never exceeds the
 * picture year cap. Falls back to the full candidate list when every candidate
 * would be filtered out — mirroring the tag-avoidance fallback — so selection
 * never stalls when only over-cap photos remain.
 *
 * Non-picture questions (and pictures without a year answer) are never filtered.
 */
export function filterOverusedPictureYears<T extends DatedPictureQuestion>(
  candidates: T[],
  servedQuestions: readonly DatedPictureQuestion[],
  maxPerYear = MAX_PICTURES_PER_ANSWER_YEAR,
): T[] {
  const counts = new Map<number, number>();
  for (const q of servedQuestions) {
    const year = pictureAnswerYear(q);
    if (year !== null) counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  if (counts.size === 0) return candidates;

  const filtered = candidates.filter((q) => {
    const year = pictureAnswerYear(q);
    return year === null || (counts.get(year) ?? 0) < maxPerYear;
  });
  return filtered.length > 0 ? filtered : candidates;
}

// ── Helpers ──────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
