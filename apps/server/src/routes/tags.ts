import { playerTagScoresRepo, questionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { getDb } from '../db';

const tags = new Hono();

// GET /api/tags — all known tags with question counts
tags.get('/', async (c) => {
  const db = getDb();
  const [playerTags, questions] = await Promise.all([
    playerTagScoresRepo.getAllTags(db),
    questionsRepo.getRandomQuestions(db, 10000), // Get all questions to count tags
  ]);

  // Count questions per tag
  const tagQuestionCounts = new Map<string, number>();
  for (const q of questions) {
    for (const tag of q.tags) {
      const normalized = tag.toLowerCase().trim();
      tagQuestionCounts.set(normalized, (tagQuestionCounts.get(normalized) ?? 0) + 1);
    }
  }

  // Merge player tag data with question counts
  const allTagNames = new Set([...playerTags.map((t) => t.tag), ...tagQuestionCounts.keys()]);
  const result = [...allTagNames].map((tag) => ({
    tag,
    questionCount: tagQuestionCounts.get(tag) ?? 0,
    playerCount: playerTags.find((t) => t.tag === tag)?.playerCount ?? 0,
  }));

  result.sort((a, b) => b.questionCount - a.questionCount);

  return c.json({ tags: result });
});

export default tags;
