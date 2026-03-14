import { parseQuestionSetYaml, questionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { getDb } from '../db';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const MAX_YAML_SIZE = 10 * 1024 * 1024; // 10MB

const questionSets = new Hono();

/**
 * Simple bearer token auth for mutation endpoints.
 * If ADMIN_TOKEN is not set, mutations are open (dev mode).
 */
function requireAuth(c: any): boolean {
  if (!ADMIN_TOKEN) return true;
  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
    return false;
  }
  return true;
}

// GET /api/question-sets — list all sets (optional ?language= filter)
questionSets.get('/', async (c) => {
  const db = getDb();
  const language = c.req.query('language') || undefined;
  const sets = await questionsRepo.getQuestionSets(db, null, language);
  return c.json({ sets });
});

// GET /api/question-sets/:id — get set details with questions
questionSets.get('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const set = await questionsRepo.getQuestionSet(db, id);
  if (!set) {
    return c.json({ error: 'Question set not found' }, 404);
  }
  const questions = await questionsRepo.getQuestionsBySet(db, id);
  return c.json({ set, questions });
});

// POST /api/question-sets — upload YAML question set
questionSets.post('/', async (c) => {
  if (!requireAuth(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const contentType = c.req.header('Content-Type') ?? '';
  let yamlText: string;

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded. Use field name "file"' }, 400);
    }
    if (file.size > MAX_YAML_SIZE) {
      return c.json({ error: `File too large. Max ${MAX_YAML_SIZE / 1024 / 1024}MB` }, 413);
    }
    yamlText = await file.text();
  } else if (
    contentType.includes('text/yaml') ||
    contentType.includes('application/x-yaml') ||
    contentType.includes('text/plain')
  ) {
    yamlText = await c.req.text();
    if (yamlText.length > MAX_YAML_SIZE) {
      return c.json({ error: `Body too large. Max ${MAX_YAML_SIZE / 1024 / 1024}MB` }, 413);
    }
  } else {
    return c.json(
      { error: 'Unsupported Content-Type. Use multipart/form-data, text/yaml, or text/plain' },
      415,
    );
  }

  const result = parseQuestionSetYaml(yamlText);
  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.errors }, 400);
  }

  const db = getDb();
  const setId = crypto.randomUUID();
  await db.transaction(async () => {
    await questionsRepo.importQuestionSet(db, setId, result.data, () => crypto.randomUUID(), null);
  });

  const set = await questionsRepo.getQuestionSet(db, setId);

  return c.json(
    {
      id: setId,
      name: set!.name,
      questionCount: set!.questionCount,
      message: `Imported ${set!.questionCount} questions`,
    },
    201,
  );
});

// DELETE /api/question-sets/:id — soft-delete a set
questionSets.delete('/:id', async (c) => {
  if (!requireAuth(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = getDb();
  const id = c.req.param('id');
  const deleted = await questionsRepo.softDeleteQuestionSet(db, id);
  if (!deleted) {
    return c.json({ error: 'Question set not found' }, 404);
  }
  return c.json({ message: 'Question set deleted' });
});

export default questionSets;
