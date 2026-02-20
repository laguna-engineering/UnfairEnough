import type { DbAdapter } from '../adapter';
import type { QuestionSetInput } from '../import/validator';
import type {
  MetaSetChildRow,
  QuestionRow,
  QuestionSetRow,
  QuestionSetWithMeta,
  QuestionWithMeta,
} from '../schema';

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
    difficulty: row.difficulty,
    explanation: row.explanation,
    timesAsked: row.times_asked,
    lastAskedAt: row.last_asked_at,
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
    isMeta: row.is_meta === 1,
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
        media_type, media_url, media_preview_duration, options, correct_answer, player_difficulty, difficulty, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        q.difficulty ?? 3,
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

  sql += ' ORDER BY last_asked_at IS NOT NULL, last_asked_at ASC, RANDOM() LIMIT ?';
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
  // For meta sets, compute question_count dynamically from child sets
  const rows = await db.all<QuestionSetRow>(
    `SELECT qs.*,
       CASE WHEN qs.is_meta = 1
         THEN COALESCE((
           SELECT COUNT(*) FROM questions q
           JOIN meta_set_children msc ON q.set_id = msc.child_set_id
           JOIN question_sets cs ON cs.id = msc.child_set_id AND cs.deleted_at IS NULL
           WHERE msc.meta_set_id = qs.id
         ), 0)
         ELSE qs.question_count
       END AS question_count
     FROM question_sets qs
     WHERE qs.deleted_at IS NULL
     ORDER BY qs.created_at DESC`,
  );
  return rows.map(rowToQuestionSetWithMeta);
}

export async function getQuestionSet(
  db: DbAdapter,
  setId: string,
): Promise<QuestionSetWithMeta | null> {
  const row = await db.get<QuestionSetRow>(
    `SELECT qs.*,
       CASE WHEN qs.is_meta = 1
         THEN COALESCE((
           SELECT COUNT(*) FROM questions q
           JOIN meta_set_children msc ON q.set_id = msc.child_set_id
           JOIN question_sets cs ON cs.id = msc.child_set_id AND cs.deleted_at IS NULL
           WHERE msc.meta_set_id = qs.id
         ), 0)
         ELSE qs.question_count
       END AS question_count
     FROM question_sets qs
     WHERE qs.id = ? AND qs.deleted_at IS NULL`,
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

export async function getQuestionsByTag(
  db: DbAdapter,
  tag: string,
  limit?: number,
): Promise<QuestionWithMeta[]> {
  let sql = `SELECT * FROM questions WHERE EXISTS (
    SELECT 1 FROM json_each(tags) WHERE json_each.value = ?
  ) AND (set_id IS NULL OR set_id NOT IN (
    SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
  )) ORDER BY rowid`;
  const params: (string | number)[] = [tag];

  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  const rows = await db.all<QuestionRow>(sql, params);
  return rows.map(rowToQuestionWithMeta);
}

export async function markQuestionAsked(db: DbAdapter, questionId: string): Promise<void> {
  await db.run(
    `UPDATE questions SET times_asked = times_asked + 1, last_asked_at = datetime('now') WHERE id = ?`,
    [questionId],
  );
}

// ── Meta question sets ──────────────────────────────────────

export async function createMetaSet(
  db: DbAdapter,
  id: string,
  name: string,
  childSetIds: string[],
  description?: string,
  defaultTimeLimit?: number,
): Promise<string> {
  await db.run(
    `INSERT INTO question_sets (id, name, description, default_time_limit, is_meta, question_count)
     VALUES (?, ?, ?, ?, 1, 0)`,
    [id, name, description ?? null, defaultTimeLimit ?? 10],
  );

  for (let i = 0; i < childSetIds.length; i++) {
    await db.run(
      'INSERT INTO meta_set_children (meta_set_id, child_set_id, sort_order) VALUES (?, ?, ?)',
      [id, childSetIds[i], i],
    );
  }

  return id;
}

export async function updateMetaSet(
  db: DbAdapter,
  id: string,
  name: string,
  childSetIds: string[],
  description?: string,
  defaultTimeLimit?: number,
): Promise<boolean> {
  const result = await db.run(
    `UPDATE question_sets SET name = ?, description = ?, default_time_limit = ?, updated_at = datetime('now')
     WHERE id = ? AND is_meta = 1 AND deleted_at IS NULL`,
    [name, description ?? null, defaultTimeLimit ?? 10, id],
  );
  if (result.changes === 0) return false;

  // Replace child set memberships
  await db.run('DELETE FROM meta_set_children WHERE meta_set_id = ?', [id]);
  for (let i = 0; i < childSetIds.length; i++) {
    await db.run(
      'INSERT INTO meta_set_children (meta_set_id, child_set_id, sort_order) VALUES (?, ?, ?)',
      [id, childSetIds[i], i],
    );
  }

  return true;
}

export async function getMetaSetChildren(
  db: DbAdapter,
  metaSetId: string,
): Promise<QuestionSetWithMeta[]> {
  const rows = await db.all<QuestionSetRow>(
    `SELECT qs.* FROM question_sets qs
     JOIN meta_set_children msc ON qs.id = msc.child_set_id
     WHERE msc.meta_set_id = ? AND qs.deleted_at IS NULL
     ORDER BY msc.sort_order`,
    [metaSetId],
  );
  return rows.map(rowToQuestionSetWithMeta);
}

export async function getMetaSetChildIds(
  db: DbAdapter,
  metaSetId: string,
): Promise<string[]> {
  const rows = await db.all<MetaSetChildRow>(
    `SELECT msc.* FROM meta_set_children msc
     JOIN question_sets qs ON qs.id = msc.child_set_id
     WHERE msc.meta_set_id = ? AND qs.deleted_at IS NULL
     ORDER BY msc.sort_order`,
    [metaSetId],
  );
  return rows.map((r) => r.child_set_id);
}

export async function getQuestionsByMetaSet(
  db: DbAdapter,
  metaSetId: string,
): Promise<QuestionWithMeta[]> {
  const rows = await db.all<QuestionRow>(
    `SELECT q.* FROM questions q
     JOIN meta_set_children msc ON q.set_id = msc.child_set_id
     JOIN question_sets cs ON cs.id = msc.child_set_id AND cs.deleted_at IS NULL
     WHERE msc.meta_set_id = ?
     ORDER BY RANDOM()`,
    [metaSetId],
  );
  return rows.map(rowToQuestionWithMeta);
}

export async function getMetaSetQuestionCount(
  db: DbAdapter,
  metaSetId: string,
): Promise<number> {
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM questions q
     JOIN meta_set_children msc ON q.set_id = msc.child_set_id
     JOIN question_sets cs ON cs.id = msc.child_set_id AND cs.deleted_at IS NULL
     WHERE msc.meta_set_id = ?`,
    [metaSetId],
  );
  return row?.count ?? 0;
}
