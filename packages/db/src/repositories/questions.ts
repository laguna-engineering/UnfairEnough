import type { DbAdapter, SqlValue } from '../adapter';
import type { QuestionSetInput } from '../import/validator';
import type {
  MetaSetChildRow,
  QuestionRow,
  QuestionSetRow,
  QuestionSetWithMeta,
  QuestionWithMeta,
} from '../schema';
import { hostScope } from '../utils';
import { trueFalseCorrectKey, trueFalseOptions } from './questionTypeNormalization';

/**
 * Normalize a raw row into the shape game code always sees, regardless of how
 * the type-specific data is actually stored:
 * - true_false: synthesizes the True/False options and maps `correctAnswer`
 *   ('true'/'false') to the tile key ('A'/'B') game code compares against.
 * - closest_wins: empty `options`, numeric `correctValue`, and `range` read
 *   from the range_* columns (correct_answer holds the decimal string).
 * - predict_room: keeps its authored options; `correctAnswer` is '' (no
 *   correct choice — only predictions score).
 */
function rowToQuestionWithMeta(row: QuestionRow): QuestionWithMeta {
  const base = {
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
    audio: row.audio_url
      ? {
          url: row.audio_url,
          play: row.audio_play ?? 'question',
          role: row.audio_role ?? 'background',
          duration: row.audio_duration ?? undefined,
        }
      : null,
    playerDifficulty: row.player_difficulty ? JSON.parse(row.player_difficulty) : null,
    difficulty: row.difficulty,
    explanation: row.explanation,
    hideTags: row.hide_tags === 1,
    language: row.language,
    timesAsked: row.times_asked,
    lastAskedAt: row.last_asked_at,
  };

  if (row.type === 'true_false') {
    return {
      ...base,
      options: trueFalseOptions(),
      correctAnswer: trueFalseCorrectKey(row.correct_answer),
    };
  }

  if (row.type === 'closest_wins') {
    return {
      ...base,
      options: [],
      correctAnswer: row.correct_answer,
      correctValue: Number(row.correct_answer),
      range:
        row.range_min !== null && row.range_max !== null
          ? { min: row.range_min, max: row.range_max, step: row.range_step ?? undefined }
          : undefined,
    };
  }

  return {
    ...base,
    options: JSON.parse(row.options),
    correctAnswer: row.correct_answer,
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
    availableInCasual: row.available_in_casual !== 0,
    language: row.language,
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
  hostId: string | null,
): Promise<string> {
  const setLanguage = input.language ?? 'en';
  await db.run(
    `INSERT INTO question_sets (id, name, author, description, default_time_limit, tags, question_count, available_in_casual, language, host_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      setId,
      input.name,
      input.author ?? null,
      input.description ?? null,
      input.defaultTimeLimit ?? 10,
      input.tags ? JSON.stringify(input.tags) : null,
      input.questions.length,
      input.availableInCasual === false ? 0 : 1,
      setLanguage,
      hostId,
    ],
  );

  for (const q of input.questions) {
    const questionId = generateId();
    // closest_wins has no correctAnswer key — the correct value lives in the
    // same TEXT column as its decimal string; predict_room has no correct
    // answer at all (validator already resolves it to '').
    const correctAnswer =
      q.type === 'closest_wins' && typeof q.correctValue === 'number'
        ? String(q.correctValue)
        : q.correctAnswer;
    await db.run(
      `INSERT INTO questions (id, set_id, original_id, type, text, category, tags, time_limit,
        media_type, media_url, media_preview_duration, audio_url, audio_play, audio_role, audio_duration,
        options, correct_answer, player_difficulty, difficulty, explanation, hide_tags, language,
        range_min, range_max, range_step)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        q.audio?.url ?? null,
        q.audio?.play ?? null,
        q.audio?.role ?? null,
        q.audio?.duration ?? null,
        JSON.stringify(q.options),
        correctAnswer,
        q.playerDifficulty ? JSON.stringify(q.playerDifficulty) : null,
        q.difficulty ?? 3,
        q.explanation ?? null,
        q.hideTags ? 1 : 0,
        q.language ?? setLanguage,
        q.range?.min ?? null,
        q.range?.max ?? null,
        q.range?.step ?? null,
      ],
    );
  }

  return setId;
}

export async function getRandomQuestions(
  db: DbAdapter,
  count: number,
  hostId: string | null,
  excludeSetIds?: string[],
  language?: string,
): Promise<QuestionWithMeta[]> {
  let sql = `SELECT * FROM questions WHERE (set_id IS NULL OR set_id NOT IN (
    SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
  )) AND (set_id IS NULL OR set_id NOT IN (
    SELECT id FROM question_sets WHERE available_in_casual = 0
  ))`;
  const params: SqlValue[] = [];

  // Scope to host's question sets
  const { clause: hostClause, params: hostParams } = hostScope(hostId);
  sql += ` AND (set_id IS NULL OR set_id IN (SELECT id FROM question_sets WHERE ${hostClause}))`;
  params.push(...hostParams);

  if (excludeSetIds && excludeSetIds.length > 0) {
    const placeholders = excludeSetIds.map(() => '?').join(',');
    sql += ` AND (set_id IS NULL OR set_id NOT IN (${placeholders}))`;
    params.push(...excludeSetIds);
  }

  if (language) {
    sql += ' AND language = ?';
    params.push(language);
  }

  sql += ' ORDER BY last_asked_at IS NOT NULL, last_asked_at ASC, RANDOM() LIMIT ?';
  params.push(count);

  const rows = await db.all<QuestionRow>(sql, params);
  return rows.map(rowToQuestionWithMeta);
}

export async function getQuestionsBySetIds(
  db: DbAdapter,
  setIds: string[],
): Promise<QuestionWithMeta[]> {
  if (setIds.length === 0) return [];
  const placeholders = setIds.map(() => '?').join(',');
  const rows = await db.all<QuestionRow>(
    `SELECT * FROM questions WHERE set_id IN (${placeholders})
     AND set_id NOT IN (SELECT id FROM question_sets WHERE deleted_at IS NOT NULL)
     ORDER BY last_asked_at IS NOT NULL, last_asked_at ASC, RANDOM()`,
    setIds,
  );
  return rows.map(rowToQuestionWithMeta);
}

export async function getQuestionsBySet(db: DbAdapter, setId: string): Promise<QuestionWithMeta[]> {
  const rows = await db.all<QuestionRow>(
    'SELECT * FROM questions WHERE set_id = ? ORDER BY rowid',
    [setId],
  );
  return rows.map(rowToQuestionWithMeta);
}

export async function getQuestionSets(
  db: DbAdapter,
  hostId: string | null,
  language?: string,
): Promise<QuestionSetWithMeta[]> {
  // For meta sets, compute question_count dynamically from child sets
  let sql = `SELECT qs.*,
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
     WHERE qs.deleted_at IS NULL`;
  const params: SqlValue[] = [];

  const { clause: hostClause, params: hostParams } = hostScope(hostId);
  sql += ` AND qs.${hostClause}`;
  params.push(...hostParams);

  if (language) {
    sql += ' AND qs.language = ?';
    params.push(language);
  }

  sql += ' ORDER BY qs.created_at DESC';

  const rows = await db.all<QuestionSetRow>(sql, params);
  return rows.map(rowToQuestionSetWithMeta);
}

export async function getQuestionSet(
  db: DbAdapter,
  setId: string,
  hostId?: string | null,
): Promise<QuestionSetWithMeta | null> {
  let sql = `SELECT qs.*,
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
     WHERE qs.id = ? AND qs.deleted_at IS NULL`;
  const params: SqlValue[] = [setId];
  if (hostId !== undefined && hostId !== null) {
    sql += ' AND qs.host_id = ?';
    params.push(hostId);
  } else if (hostId === null) {
    sql += ' AND qs.host_id IS NULL';
  }
  const row = await db.get<QuestionSetRow>(sql, params);
  return row ? rowToQuestionSetWithMeta(row) : null;
}

export async function softDeleteQuestionSet(
  db: DbAdapter,
  setId: string,
  hostId?: string | null,
): Promise<boolean> {
  let sql =
    "UPDATE question_sets SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL";
  const params: SqlValue[] = [setId];
  if (hostId !== undefined && hostId !== null) {
    sql += ' AND host_id = ?';
    params.push(hostId);
  } else if (hostId === null) {
    sql += ' AND host_id IS NULL';
  }
  const result = await db.run(sql, params);
  return result.changes > 0;
}

export async function getTotalQuestionCount(db: DbAdapter, language?: string): Promise<number> {
  let sql = `SELECT COUNT(*) as count FROM questions WHERE (set_id IS NULL OR set_id NOT IN (
      SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
    ))`;
  const params: string[] = [];

  if (language) {
    sql += ' AND language = ?';
    params.push(language);
  }

  const row = await db.get<{ count: number }>(sql, params);
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

/**
 * Load all non-deleted, casual-available questions for the host/language that carry
 * AT LEAST ONE of the given tags (union matching). Shares its scoping predicate with
 * `getTagsWithCounts` so the picker's per-tag counts match the pool this returns.
 * Empty `tags` returns `[]` without hitting the DB.
 */
export async function getQuestionsByTags(
  db: DbAdapter,
  tags: string[],
  opts: { hostId: string | null; language?: string },
): Promise<QuestionWithMeta[]> {
  if (tags.length === 0) return [];

  const { clause: hostClause, params: hostParams } = hostScope(opts.hostId);
  const tagPlaceholders = tags.map(() => '?').join(',');

  let sql = `SELECT * FROM questions WHERE (set_id IS NULL OR set_id NOT IN (
    SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
  )) AND (set_id IS NULL OR set_id NOT IN (
    SELECT id FROM question_sets WHERE available_in_casual = 0
  )) AND (set_id IS NULL OR set_id IN (
    SELECT id FROM question_sets WHERE ${hostClause}
  )) AND EXISTS (
    SELECT 1 FROM json_each(tags) WHERE json_each.value IN (${tagPlaceholders})
  )`;
  const params: SqlValue[] = [...hostParams, ...tags];

  if (opts.language) {
    sql += ' AND language = ?';
    params.push(opts.language);
  }

  sql += ' ORDER BY rowid';

  const rows = await db.all<QuestionRow>(sql, params);
  return rows.map(rowToQuestionWithMeta);
}

/**
 * Distinct tags across the host's non-deleted, casual-available questions for the
 * given language, each with the count of questions carrying it. Shares its predicate
 * with `getQuestionsByTags` (R9) so a tag's displayed count equals the pool size a
 * single-tag selection would load.
 */
export async function getTagsWithCounts(
  db: DbAdapter,
  hostId: string | null,
  language?: string,
): Promise<{ tag: string; questionCount: number }[]> {
  const { clause: hostClause, params: hostParams } = hostScope(hostId);

  let sql = `SELECT json_each.value AS tag, COUNT(*) AS question_count
    FROM questions, json_each(questions.tags)
    WHERE (questions.set_id IS NULL OR questions.set_id NOT IN (
      SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
    )) AND (questions.set_id IS NULL OR questions.set_id NOT IN (
      SELECT id FROM question_sets WHERE available_in_casual = 0
    )) AND (questions.set_id IS NULL OR questions.set_id IN (
      SELECT id FROM question_sets WHERE ${hostClause}
    ))`;
  const params: SqlValue[] = [...hostParams];

  if (language) {
    sql += ' AND questions.language = ?';
    params.push(language);
  }

  sql += ' GROUP BY json_each.value ORDER BY question_count DESC, tag ASC';

  const rows = await db.all<{ tag: string; question_count: number }>(sql, params);
  return rows.map((r) => ({ tag: r.tag, questionCount: r.question_count }));
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
  hostId: string | null,
  description?: string,
  defaultTimeLimit?: number,
): Promise<string> {
  await db.run(
    `INSERT INTO question_sets (id, name, description, default_time_limit, is_meta, question_count, host_id)
     VALUES (?, ?, ?, ?, 1, 0, ?)`,
    [id, name, description ?? null, defaultTimeLimit ?? 10, hostId],
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

export async function getMetaSetChildIds(db: DbAdapter, metaSetId: string): Promise<string[]> {
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
  limit?: number,
): Promise<QuestionWithMeta[]> {
  let sql = `SELECT q.* FROM questions q
     JOIN meta_set_children msc ON q.set_id = msc.child_set_id
     JOIN question_sets cs ON cs.id = msc.child_set_id AND cs.deleted_at IS NULL
     WHERE msc.meta_set_id = ?
     ORDER BY q.last_asked_at IS NOT NULL, q.last_asked_at ASC, RANDOM()`;
  const params: (string | number)[] = [metaSetId];

  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  const rows = await db.all<QuestionRow>(sql, params);
  return rows.map(rowToQuestionWithMeta);
}

// ── Question stats ──────────────────────────────────────────

export interface QuestionStats {
  id: string;
  text: string;
  category: string | null;
  tags: string[];
  difficulty: number;
  language: string;
  timesAsked: number;
  lastAskedAt: string | null;
  setName: string | null;
  totalAnswers: number;
  correctCount: number;
  pctCorrect: number | null;
}

interface QuestionStatsRow {
  id: string;
  text: string;
  category: string | null;
  tags: string | null;
  difficulty: number;
  language: string;
  times_asked: number;
  last_asked_at: string | null;
  set_name: string | null;
  total_answers: number;
  correct_count: number;
}

export async function getQuestionStats(
  db: DbAdapter,
  hostId: string | null,
): Promise<QuestionStats[]> {
  let sql = `
    SELECT q.id, q.text, q.category, q.tags, q.difficulty, q.language,
           q.times_asked, q.last_asked_at,
           qs.name AS set_name,
           COUNT(rr.id) AS total_answers,
           SUM(CASE WHEN rr.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
    FROM questions q
    LEFT JOIN round_results rr ON rr.question_id = q.id
    LEFT JOIN question_sets qs ON qs.id = q.set_id AND qs.deleted_at IS NULL
    WHERE (q.set_id IS NULL OR q.set_id NOT IN (
      SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
    ))`;
  const params: SqlValue[] = [];

  if (hostId !== null) {
    sql += ' AND (qs.host_id = ? OR q.set_id IS NULL)';
    params.push(hostId);
  } else {
    sql += ' AND (qs.host_id IS NULL OR q.set_id IS NULL)';
  }

  sql += ' GROUP BY q.id ORDER BY q.times_asked DESC';

  const rows = await db.all<QuestionStatsRow>(sql, params);
  return rows.map((r) => {
    const totalAnswers = Number(r.total_answers);
    const correctCount = Number(r.correct_count);
    return {
      id: r.id,
      text: r.text,
      category: r.category,
      tags: r.tags ? JSON.parse(r.tags) : [],
      difficulty: r.difficulty,
      language: r.language,
      timesAsked: r.times_asked,
      lastAskedAt: r.last_asked_at,
      setName: r.set_name,
      totalAnswers,
      correctCount,
      pctCorrect: totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : null,
    };
  });
}

export async function getMetaSetQuestionCount(db: DbAdapter, metaSetId: string): Promise<number> {
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM questions q
     JOIN meta_set_children msc ON q.set_id = msc.child_set_id
     JOIN question_sets cs ON cs.id = msc.child_set_id AND cs.deleted_at IS NULL
     WHERE msc.meta_set_id = ?`,
    [metaSetId],
  );
  return row?.count ?? 0;
}
