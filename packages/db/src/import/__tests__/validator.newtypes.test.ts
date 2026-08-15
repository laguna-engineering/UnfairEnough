import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { createBunAdapter, type DbAdapter } from '../../adapter';
import { configurePragmas, runMigrations } from '../../migrations';
import * as questionsRepo from '../../repositories/questions';
import { validateQuestionSet } from '../validator';

/** Build a question-set object with a single closest_wins question. */
function setWithClosestWins(extra: Record<string, unknown> = {}) {
  return {
    name: 'Estimation Set',
    questions: [
      {
        text: 'How many teeth does a snail have?',
        type: 'closest_wins',
        correctValue: 14000,
        range: { min: 0, max: 30000 },
        ...extra,
      },
    ],
  };
}

/** Build a question-set object with a single predict_room question. */
function setWithPredictRoom(extra: Record<string, unknown> = {}) {
  return {
    name: 'Poll Set',
    questions: [
      {
        text: 'Best pizza topping?',
        type: 'predict_room',
        options: [
          { key: 'A', text: 'Pepperoni' },
          { key: 'B', text: 'Mushroom' },
        ],
        ...extra,
      },
    ],
  };
}

async function freshDb(): Promise<DbAdapter> {
  const db = createBunAdapter(new Database(':memory:'));
  await configurePragmas(db);
  await runMigrations(db);
  return db;
}

describe('closest_wins validation', () => {
  it('accepts a valid closest_wins question', () => {
    const { data, errors } = validateQuestionSet(setWithClosestWins());
    expect(errors).toEqual([]);
    expect(data.questions[0].correctValue).toBe(14000);
    expect(data.questions[0].range).toEqual({ min: 0, max: 30000, step: undefined });
    expect(data.questions[0].options).toEqual([]);
  });

  it('accepts an optional numeric step', () => {
    const { errors, data } = validateQuestionSet(
      setWithClosestWins({ range: { min: 0, max: 30000, step: 100 } }),
    );
    expect(errors).toEqual([]);
    expect(data.questions[0].range).toEqual({ min: 0, max: 30000, step: 100 });
  });

  it('rejects options', () => {
    const { errors } = validateQuestionSet(
      setWithClosestWins({ options: [{ key: 'A', text: 'One' }] }),
    );
    expect(errors.some((e) => e.includes('options') && e.includes('closest_wins'))).toBe(true);
  });

  it('rejects correctAnswer', () => {
    const { errors } = validateQuestionSet(setWithClosestWins({ correctAnswer: 'A' }));
    expect(errors.some((e) => e.includes('correctAnswer'))).toBe(true);
  });

  it('rejects a missing correctValue', () => {
    const { errors } = validateQuestionSet(setWithClosestWins({ correctValue: undefined }));
    expect(errors.some((e) => e.includes('correctValue'))).toBe(true);
  });

  it('rejects a non-numeric correctValue', () => {
    const { errors } = validateQuestionSet(setWithClosestWins({ correctValue: 'lots' }));
    expect(errors.some((e) => e.includes('correctValue'))).toBe(true);
  });

  it('rejects a missing range', () => {
    const { errors } = validateQuestionSet(setWithClosestWins({ range: undefined }));
    expect(errors.some((e) => e.includes('range'))).toBe(true);
  });

  it('rejects min >= max', () => {
    const { errors } = validateQuestionSet(setWithClosestWins({ range: { min: 100, max: 100 } }));
    expect(errors.some((e) => e.includes('range') && e.includes('less than'))).toBe(true);
  });

  it('rejects a non-positive step', () => {
    const { errors } = validateQuestionSet(
      setWithClosestWins({ range: { min: 0, max: 100, step: 0 } }),
    );
    expect(errors.some((e) => e.includes('range.step'))).toBe(true);
  });
});

describe('predict_room validation', () => {
  it('accepts a valid predict_room question', () => {
    const { data, errors } = validateQuestionSet(setWithPredictRoom());
    expect(errors).toEqual([]);
    expect(data.questions[0].correctAnswer).toBe('');
    expect(data.questions[0].options).toHaveLength(2);
  });

  it('accepts up to 4 options', () => {
    const { errors } = validateQuestionSet(
      setWithPredictRoom({
        options: [
          { key: 'A', text: 'One' },
          { key: 'B', text: 'Two' },
          { key: 'C', text: 'Three' },
          { key: 'D', text: 'Four' },
        ],
      }),
    );
    expect(errors).toEqual([]);
  });

  it('rejects correctAnswer', () => {
    const { errors } = validateQuestionSet(setWithPredictRoom({ correctAnswer: 'A' }));
    expect(errors.some((e) => e.includes('correctAnswer') && e.includes('predict_room'))).toBe(
      true,
    );
  });

  it('rejects fewer than 2 options', () => {
    const { errors } = validateQuestionSet(
      setWithPredictRoom({ options: [{ key: 'A', text: 'One' }] }),
    );
    expect(errors.some((e) => e.includes('options'))).toBe(true);
  });

  it('rejects more than 4 options', () => {
    const { errors } = validateQuestionSet(
      setWithPredictRoom({
        options: [
          { key: 'A', text: 'One' },
          { key: 'B', text: 'Two' },
          { key: 'C', text: 'Three' },
          { key: 'D', text: 'Four' },
          { key: 'E', text: 'Five' },
        ],
      }),
    );
    expect(errors.some((e) => e.includes('predict_room allows max 4'))).toBe(true);
  });
});

describe('new question types insert -> read round-trip', () => {
  let db: DbAdapter;
  let counter: number;
  const genId = () => `q-${counter++}`;

  beforeEach(async () => {
    db = await freshDb();
    counter = 0;
  });

  it('persists and normalizes a closest_wins question on load', async () => {
    const { data, errors } = validateQuestionSet(setWithClosestWins());
    expect(errors).toEqual([]);

    const setId = await questionsRepo.importQuestionSet(db, 'set-cw', data, genId, null);
    const [row] = await questionsRepo.getQuestionsBySet(db, setId);

    expect(row.type).toBe('closest_wins');
    expect(row.options).toEqual([]);
    expect(row.correctValue).toBe(14000);
    expect(row.range).toEqual({ min: 0, max: 30000, step: undefined });
  });

  it('persists and normalizes a predict_room question on load', async () => {
    const { data, errors } = validateQuestionSet(setWithPredictRoom());
    expect(errors).toEqual([]);

    const setId = await questionsRepo.importQuestionSet(db, 'set-pr', data, genId, null);
    const [row] = await questionsRepo.getQuestionsBySet(db, setId);

    expect(row.type).toBe('predict_room');
    expect(row.correctAnswer).toBe('');
    expect(row.options).toEqual([
      { key: 'A', text: 'Pepperoni' },
      { key: 'B', text: 'Mushroom' },
    ]);
  });

  it('normalizes true_false options and correctAnswer on load', async () => {
    const { data, errors } = validateQuestionSet({
      name: 'TF Set',
      questions: [
        {
          text: 'Is the sky blue?',
          type: 'true_false',
          options: [
            { key: 'A', text: 'True' },
            { key: 'B', text: 'False' },
          ],
          correctAnswer: 'true',
        },
      ],
    });
    expect(errors).toEqual([]);

    const setId = await questionsRepo.importQuestionSet(db, 'set-tf', data, genId, null);
    const [row] = await questionsRepo.getQuestionsBySet(db, setId);

    expect(row.options).toEqual([
      { key: 'A', text: 'True' },
      { key: 'B', text: 'False' },
    ]);
    expect(row.correctAnswer).toBe('A');
  });
});
