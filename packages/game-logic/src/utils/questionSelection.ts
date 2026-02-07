import type { QuestionWithMeta } from '@unfairenough/db';
import { computePlayerDifficulty } from './tagScoring';

export interface RoundSelectionPlayer {
  profileId: string;
  name: string;
  currentScore: number;
}

export interface RoundSelectionContext {
  players: RoundSelectionPlayer[];
  playerTagScores: Map<string, Map<string, number>>; // profileId -> tag -> decayed score
}

/**
 * Select the next question dynamically based on current game state.
 *
 * Core principle: pick questions that are EASIER for trailing players.
 * Uses weighted random from top candidates to maintain variety.
 *
 * Falls back to random when:
 * - All players are tied or it's the first round
 * - No players have profiles / tag data
 * - Only one question remains
 */
export function selectNextQuestion(
  remainingPool: QuestionWithMeta[],
  context: RoundSelectionContext,
): QuestionWithMeta {
  if (remainingPool.length <= 1) return remainingPool[0];

  const { players, playerTagScores } = context;

  // Identify trailing players (below average score)
  const avgScore = players.reduce((s, p) => s + p.currentScore, 0) / players.length;
  const trailingPlayers = players.filter((p) => p.currentScore < avgScore);

  // All tied, first round, or everyone trailing → random
  if (trailingPlayers.length === 0 || trailingPlayers.length === players.length) {
    return randomPick(remainingPool);
  }

  const leadingPlayers = players.filter((p) => p.currentScore >= avgScore);

  // Score each candidate question by catch-up potential
  const scored = remainingPool.map((q) => {
    const tags = q.tags ?? [];
    if (tags.length === 0) return { question: q, catchUpScore: 0 };

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
    const avgLeadingHardness = leadingHardness.reduce((a, b) => a + b, 0) / leadingHardness.length;

    // 70% weight on trailing easiness, 30% on leading hardness
    const catchUpScore = avgTrailingEasiness * 0.7 + avgLeadingHardness * 0.3;

    return { question: q, catchUpScore };
  });

  // Weighted random from top 5 candidates
  scored.sort((a, b) => b.catchUpScore - a.catchUpScore);
  const topCandidates = scored.slice(0, Math.min(5, scored.length));

  const totalWeight = topCandidates.reduce((s, c) => s + Math.max(c.catchUpScore, 0.1), 0);
  let roll = Math.random() * totalWeight;
  for (const candidate of topCandidates) {
    roll -= Math.max(candidate.catchUpScore, 0.1);
    if (roll <= 0) return candidate.question;
  }

  return topCandidates[0].question;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
