import type { AnswerKey, QuestionOption, QuestionType } from '@unfairenough/ws-protocol';

/** true_false always renders as two tiles keyed A (True) and B (False). */
export const TRUE_KEY: AnswerKey = 'A';
export const FALSE_KEY: AnswerKey = 'B';

/**
 * Map an authored true_false `correctAnswer` ('true' | 'false', case-insensitive)
 * to the tile key it corresponds to.
 */
export function trueFalseCorrectKey(correctAnswer: string): AnswerKey {
  return correctAnswer.trim().toLowerCase() === 'true' ? TRUE_KEY : FALSE_KEY;
}

/**
 * Fallback True/False tile labels for authors who declare a true_false
 * question without writing options (R2). Apps localize these by question type
 * rather than rendering this text directly.
 */
export function trueFalseOptions(): QuestionOption[] {
  return [
    { key: TRUE_KEY, text: 'True' },
    { key: FALSE_KEY, text: 'False' },
  ];
}

/**
 * Time-limit multiplier by question type. Two-step types (predict_room: vote,
 * then prediction) give players twice the configured time.
 */
export function questionTimeMultiplier(type: QuestionType | undefined): number {
  return type === 'predict_room' ? 2 : 1;
}

/**
 * All predict_room options tied for the most votes. Empty array if no votes
 * were cast at all (R12/AE4 — ties all count as correct predictions).
 */
export function resolvePollWinners(voteCounts: Partial<Record<AnswerKey, number>>): AnswerKey[] {
  const entries = Object.entries(voteCounts) as [AnswerKey, number][];
  const maxVotes = entries.reduce((max, [, count]) => Math.max(max, count), 0);
  if (maxVotes <= 0) return [];
  return entries.filter(([, count]) => count === maxVotes).map(([key]) => key);
}

/**
 * Default slider/number-pad step for a closest_wins range, so small ranges
 * step by 1 and large ranges step by round increments (e.g. 0–100,000 steps
 * by 1,000; 0–50 steps by 1).
 */
export function defaultGuessStep(min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 1;
  return Math.max(1, 10 ** Math.floor(Math.log10(span / 100)));
}
