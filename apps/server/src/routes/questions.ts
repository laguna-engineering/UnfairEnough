import { Hono } from 'hono';
import { getDb } from '../db';

interface QuestionStatsRow {
  id: string;
  text: string;
  category: string | null;
  tags: string | null;
  difficulty: number;
  language: string;
  times_asked: number;
  last_asked_at: string | null;
  set_id: string | null;
  set_name: string | null;
  total_answers: number;
  correct_count: number;
}

const questions = new Hono();

// GET /api/questions/stats — all questions with usage stats and % correct
questions.get('/stats', async (c) => {
  const db = getDb();

  const rows = await db.all<QuestionStatsRow>(`
    SELECT q.id, q.text, q.category, q.tags, q.difficulty, q.language,
           q.times_asked, q.last_asked_at, q.set_id,
           qs.name AS set_name,
           COUNT(rr.id) AS total_answers,
           SUM(CASE WHEN rr.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
    FROM questions q
    LEFT JOIN round_results rr ON rr.question_id = q.id
    LEFT JOIN question_sets qs ON qs.id = q.set_id AND qs.deleted_at IS NULL
    WHERE q.set_id IS NULL OR q.set_id NOT IN (
      SELECT id FROM question_sets WHERE deleted_at IS NOT NULL
    )
    GROUP BY q.id
    ORDER BY q.times_asked DESC
  `);

  const questions_list = rows.map((r) => {
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

  return c.json({ questions: questions_list });
});

export default questions;
