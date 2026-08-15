import type { AnswerKey, QuestionOption } from '@unfairenough/ws-protocol';

/**
 * true_false tile-key mapping and fallback labels, mirrored from
 * `packages/game-logic/src/utils/questionTypes.ts` (kept local rather than a
 * runtime dependency — `db` deliberately stays light and doesn't otherwise
 * depend on `game-logic`'s Redux-heavy runtime). Keep these two in sync if the
 * mapping ever changes.
 */
const TRUE_KEY: AnswerKey = 'A';
const FALSE_KEY: AnswerKey = 'B';

export function trueFalseCorrectKey(correctAnswer: string): AnswerKey {
  return correctAnswer.trim().toLowerCase() === 'true' ? TRUE_KEY : FALSE_KEY;
}

export function trueFalseOptions(): QuestionOption[] {
  return [
    { key: TRUE_KEY, text: 'True' },
    { key: FALSE_KEY, text: 'False' },
  ];
}
