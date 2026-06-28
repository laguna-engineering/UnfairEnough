import { gamesRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { getDb } from '../db';

const games = new Hono<{ Variables: AuthVariables }>();

// GET /api/games — list recent games
games.get('/', async (c) => {
  const db = getDb();
  const limit = Number(c.req.query('limit')) || 20;
  const recentGames = await gamesRepo.getRecentGames(db, c.get('hostId'), Math.min(limit, 100));
  return c.json({ games: recentGames });
});

// GET /api/games/:id — game details with round-by-round results
games.get('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const game = await gamesRepo.getGame(db, id, c.get('hostId'));
  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  const results = await gamesRepo.getGameResults(db, id);
  return c.json({ game, results });
});

export default games;
