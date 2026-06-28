import { questionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { getDb } from '../db';

const questions = new Hono<{ Variables: AuthVariables }>();

// GET /api/questions/stats — all questions with usage stats and % correct
questions.get('/stats', async (c) => {
  const db = getDb();
  const stats = await questionsRepo.getQuestionStats(db, c.get('hostId'));
  return c.json({ questions: stats });
});

export default questions;
