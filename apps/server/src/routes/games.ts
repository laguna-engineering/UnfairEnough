import { Hono } from 'hono';
import { getDb } from '../db';
import { gamesRepo } from '@unfairenough/db';

const games = new Hono();

// GET /api/games — list recent games
games.get('/', async (c) => {
  const db = getDb();
  const limit = Number(c.req.query('limit')) || 20;
  const recentGames = await gamesRepo.getRecentGames(db, Math.min(limit, 100));
  return c.json({ games: recentGames });
});

// GET /api/games/:id — game details with round-by-round results
games.get('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const game = await gamesRepo.getGame(db, id);
  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  const results = await gamesRepo.getGameResults(db, id);
  return c.json({ game, results });
});

export default games;
