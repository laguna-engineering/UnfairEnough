import { playersRepo, playerTagScoresRepo, questionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { getDb } from '../db';

const tags = new Hono<{ Variables: AuthVariables }>();

// GET /api/tags — all known tags with question counts (optional ?language=)
tags.get('/', async (c) => {
  const db = getDb();
  const hostId = c.get('hostId');
  const language = c.req.query('language') || undefined;
  const [playerTags, tagCounts, allPlayers] = await Promise.all([
    playerTagScoresRepo.getAllTags(db, hostId),
    questionsRepo.getTagsWithCounts(db, hostId, language),
    playersRepo.listPlayers(db, hostId),
  ]);

  // Count questions per tag (already scoped to host/language, and to the same
  // predicate the personalized game pool uses, so counts match what a game loads).
  const tagQuestionCounts = new Map<string, number>();
  for (const { tag, questionCount } of tagCounts) {
    tagQuestionCounts.set(tag, questionCount);
  }

  // Merge player tag data with question counts
  const allTagNames = new Set([...playerTags.map((t) => t.tag), ...tagQuestionCounts.keys()]);
  const result = [...allTagNames].map((tag) => ({
    tag,
    questionCount: tagQuestionCounts.get(tag) ?? 0,
    playerCount: playerTags.find((t) => t.tag === tag)?.playerCount ?? 0,
  }));

  result.sort((a, b) => b.questionCount - a.questionCount);

  return c.json({ tags: result, totalPlayers: allPlayers.length });
});

// GET /api/tags/:tag/players — all players with their score for a tag
tags.get('/:tag/players', async (c) => {
  const db = getDb();
  const tag = decodeURIComponent(c.req.param('tag')).toLowerCase().trim();

  const hostId = c.get('hostId');
  const [allPlayers, tagScores] = await Promise.all([
    playersRepo.listPlayers(db, hostId),
    playerTagScoresRepo.getScoresByTag(db, tag, hostId),
  ]);

  const scoreByPlayerId = new Map(tagScores.map((ts) => [ts.playerId, ts.score]));

  const players = allPlayers.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    avatarColor: p.avatarColor,
    avatarEmoji: p.avatarEmoji,
    score: scoreByPlayerId.get(p.id) ?? null,
  }));

  return c.json({ tag, players });
});

// GET /api/tags/:tag/questions — questions with this tag (optional ?limit=N)
tags.get('/:tag/questions', async (c) => {
  const db = getDb();
  const tag = decodeURIComponent(c.req.param('tag')).toLowerCase().trim();
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;

  const questions = await questionsRepo.getQuestionsByTag(db, tag, limit);

  return c.json({
    tag,
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      category: q.category,
      tags: q.tags,
      difficulty: q.difficulty,
      options: q.options,
      correctAnswer: q.correctAnswer,
      media: q.media,
    })),
  });
});

export default tags;
