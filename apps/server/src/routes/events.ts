import type { EventType } from '@unfairenough/db';
import { eventsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { getDb } from '../db';

const events = new Hono();

// GET /api/events — list recent events
events.get('/', async (c) => {
  const db = getDb();
  const limit = Number(c.req.query('limit')) || 100;
  const gameId = c.req.query('gameId') || undefined;
  const eventType = (c.req.query('eventType') as EventType) || undefined;

  const rows = await eventsRepo.getEvents(db, {
    gameId,
    eventType,
    limit: Math.min(limit, 500),
  });

  return c.json({
    events: rows.map((row) => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null,
    })),
  });
});

export default events;
