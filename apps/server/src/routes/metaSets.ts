import { questionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { getDb } from '../db';

const metaSets = new Hono<{ Variables: AuthVariables }>();

// GET /api/meta-sets/:id — get meta set with resolved children
metaSets.get('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const set = await questionsRepo.getQuestionSet(db, id, c.get('hostId'));
  if (!set || !set.isMeta) {
    return c.json({ error: 'Meta set not found' }, 404);
  }
  const children = await questionsRepo.getMetaSetChildren(db, id);
  return c.json({ set, children });
});

// POST /api/meta-sets — create a meta set
metaSets.post('/', async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string;
    defaultTimeLimit?: number;
    childSetIds: string[];
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: 'Name is required' }, 400);
  }
  if (!body.childSetIds || body.childSetIds.length === 0) {
    return c.json({ error: 'At least one child set is required' }, 400);
  }

  const db = getDb();

  // Validate all child sets exist and are not meta sets
  for (const childId of body.childSetIds) {
    const child = await questionsRepo.getQuestionSet(db, childId);
    if (!child) {
      return c.json({ error: `Child set not found: ${childId}` }, 400);
    }
    if (child.isMeta) {
      return c.json({ error: `Cannot nest meta sets: ${childId}` }, 400);
    }
  }

  const id = crypto.randomUUID();
  await db.transaction(async () => {
    await questionsRepo.createMetaSet(
      db,
      id,
      body.name.trim(),
      body.childSetIds,
      c.get('hostId'),
      body.description?.trim(),
      body.defaultTimeLimit,
    );
  });

  const set = await questionsRepo.getQuestionSet(db, id);

  return c.json(
    {
      id,
      name: set!.name,
      questionCount: set!.questionCount,
      childSetCount: body.childSetIds.length,
      message: `Created meta set with ${body.childSetIds.length} child sets`,
    },
    201,
  );
});

// PUT /api/meta-sets/:id — update a meta set
metaSets.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name: string;
    description?: string;
    defaultTimeLimit?: number;
    childSetIds: string[];
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: 'Name is required' }, 400);
  }
  if (!body.childSetIds || body.childSetIds.length === 0) {
    return c.json({ error: 'At least one child set is required' }, 400);
  }

  const db = getDb();

  // Validate all child sets exist and are not meta sets
  for (const childId of body.childSetIds) {
    const child = await questionsRepo.getQuestionSet(db, childId);
    if (!child) {
      return c.json({ error: `Child set not found: ${childId}` }, 400);
    }
    if (child.isMeta) {
      return c.json({ error: `Cannot nest meta sets: ${childId}` }, 400);
    }
  }

  await db.transaction(async () => {
    const updated = await questionsRepo.updateMetaSet(
      db,
      id,
      body.name.trim(),
      body.childSetIds,
      body.description?.trim(),
      body.defaultTimeLimit,
    );
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
  });

  const set = await questionsRepo.getQuestionSet(db, id);

  return c.json({
    id,
    name: set!.name,
    questionCount: set!.questionCount,
    childSetCount: body.childSetIds.length,
    message: 'Meta set updated',
  });
});

// DELETE /api/meta-sets/:id — soft-delete a meta set
metaSets.delete('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');

  // Verify it's actually a meta set owned by this host
  const set = await questionsRepo.getQuestionSet(db, id, c.get('hostId'));
  if (!set || !set.isMeta) {
    return c.json({ error: 'Meta set not found' }, 404);
  }

  const deleted = await questionsRepo.softDeleteQuestionSet(db, id, c.get('hostId'));
  if (!deleted) {
    return c.json({ error: 'Meta set not found' }, 404);
  }
  return c.json({ message: 'Meta set deleted' });
});

export default metaSets;
