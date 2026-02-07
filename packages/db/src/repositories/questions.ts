import type { DbAdapter } from '../adapter';
import type { QuestionSetInput } from '../import/validator';
import type { QuestionRow, QuestionSetRow, QuestionSetWithMeta, QuestionWithMeta } from '../schema';

function rowToQuestionWithMeta(row: QuestionRow): QuestionWithMeta {
  return {
    id: row.id,
    setId: row.set_id,
    originalId: row.original_id,
    type: row.type,
    text: row.text,
    category: row.category,
    tags: row.tags ? JSON.parse(row.tags) : [],
    timeLimit: row.time_limit,
    media:
      row.media_type && row.media_url
        ? { type: row.media_type, url: row.media_url, previewDuration: row.media_preview_duration }
        : null,
    options: JSON.parse(row.options),
    correctAnswer: row.correct_answer,
    playerDifficulty: row.player_difficulty ? JSON.parse(row.player_difficulty) : null,
    explanation: row.explanation,
  };
}

function rowToQuestionSetWithMeta(row: QuestionSetRow): QuestionSetWithMeta {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description,
    defaultTimeLimit: row.default_time_limit,
    tags: row.tags ? JSON.parse(row.tags) : [],
    questionCount: row.question_count,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Import a validated question set into the database.
 * Returns the set ID.
 */
export async function importQuestionSet(
  db: DbAdapter,
  setId: string,
  input: QuestionSetInput,
  generateId: () => string,
): Promise<string> {
  await db.run(
    `INSERT INTO question_sets (id, name, author, description, default_time_limit, tags, question_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      setId,
      input.name,
      input.author ?? null,
      input.description ?? null,
      input.defaultTimeLimit ?? 10,
      input.tags ? JSON.stringify(input.tags) : null,
      input.questions.length,
    ],
  );

  for (const q of input.questions) {
    const questionId = generateId();
    await db.run(
      `INSERT INTO questions (id, set_id, original_id, type, text, category, tags, time_limit,
        media_type, media_url, media_preview_duration, options, correct_answer, player_difficulty, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        questionId,
        setId,
        q.id ?? null,
        q.type ?? 'multiple_choice',
        q.text,
        q.category ?? null,
        q.tags ? JSON.stringify(q.tags) : null,
        q.timeLimit ?? null,
        q.media?.type ?? null,
        q.media?.url ?? null,
        q.media?.previewDuration ?? 5,
        JSON.stringify(q.options),
        q.correctAnswer,
        q.playerDifficulty ? JSON.stringify(q.playerDifficulty) : null,
        q.explanation ?? null,
      ],
    );
  }

  return setId;
}

export async function getRandomQuestions(
  db: DbAdapter,
  count: number,
  excludeSetIds?: string[],
): Promise<QuestionWithMeta[]> {
  let sql = `SELECT * FROM questions WHERE set_id IS NULL OR set_id NOT IN (
    SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
  )`;
  const params: (string | number)[] = [];

  if (excludeSetIds && excludeSetIds.length > 0) {
    const placeholders = excludeSetIds.map(() => '?').join(',');
    sql += ` AND (set_id IS NULL OR set_id NOT IN (${placeholders}))`;
    params.push(...excludeSetIds);
  }

  sql += ' ORDER BY RANDOM() LIMIT ?';
  params.push(count);

  const rows = await db.all<QuestionRow>(sql, params);
  return rows.map(rowToQuestionWithMeta);
}

export async function getQuestionsBySet(db: DbAdapter, setId: string): Promise<QuestionWithMeta[]> {
  const rows = await db.all<QuestionRow>(
    'SELECT * FROM questions WHERE set_id = ? ORDER BY rowid',
    [setId],
  );
  return rows.map(rowToQuestionWithMeta);
}

export async function getQuestionSets(db: DbAdapter): Promise<QuestionSetWithMeta[]> {
  const rows = await db.all<QuestionSetRow>(
    'SELECT * FROM question_sets WHERE deleted_at IS NULL ORDER BY created_at DESC',
  );
  return rows.map(rowToQuestionSetWithMeta);
}

export async function getQuestionSet(
  db: DbAdapter,
  setId: string,
): Promise<QuestionSetWithMeta | null> {
  const row = await db.get<QuestionSetRow>(
    'SELECT * FROM question_sets WHERE id = ? AND deleted_at IS NULL',
    [setId],
  );
  return row ? rowToQuestionSetWithMeta(row) : null;
}

export async function softDeleteQuestionSet(db: DbAdapter, setId: string): Promise<boolean> {
  const result = await db.run(
    "UPDATE question_sets SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
    [setId],
  );
  return result.changes > 0;
}

export async function getTotalQuestionCount(db: DbAdapter): Promise<number> {
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM questions WHERE set_id IS NULL OR set_id NOT IN (
      SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
    )`,
  );
  return row?.count ?? 0;
}
