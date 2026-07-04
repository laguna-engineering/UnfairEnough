import { questionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { getDb } from '../db';
import { collectMissingMedia } from '../media/mediaStore';
import { importAndPersistSet } from '../questionSetImport';

const MAX_YAML_SIZE = 10 * 1024 * 1024; // 10MB

const questionSets = new Hono<{ Variables: AuthVariables }>();

// GET /api/question-sets — list all sets (optional ?language= filter)
questionSets.get('/', async (c) => {
  const db = getDb();
  const language = c.req.query('language') || undefined;
  const sets = await questionsRepo.getQuestionSets(db, c.get('hostId'), language);
  return c.json({ sets });
});

// GET /api/question-sets/:id — get set details with questions
questionSets.get('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const set = await questionsRepo.getQuestionSet(db, id, c.get('hostId'));
  if (!set) {
    return c.json({ error: 'Question set not found' }, 404);
  }
  const questions = await questionsRepo.getQuestionsBySet(db, id);
  return c.json({ set, questions });
});

// POST /api/question-sets — upload YAML question set
questionSets.post('/', async (c) => {
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

  const imported = await importAndPersistSet(getDb(), yamlText, c.get('hostId'));
  if (!imported.ok) {
    return c.json({ error: 'Validation failed', details: imported.errors }, 400);
  }
  const { set, questions } = imported;

  // Check which local media files are missing from disk
  const missingMedia = await collectMissingMedia(questions);

  return c.json(
    {
      id: set.id,
      name: set.name,
      questionCount: set.questionCount,
      message: `Imported ${set.questionCount} questions`,
      missingMedia,
    },
    201,
  );
});

// DELETE /api/question-sets/:id — soft-delete a set
questionSets.delete('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const deleted = await questionsRepo.softDeleteQuestionSet(db, id, c.get('hostId'));
  if (!deleted) {
    return c.json({ error: 'Question set not found' }, 404);
  }
  return c.json({ message: 'Question set deleted' });
});

export default questionSets;
