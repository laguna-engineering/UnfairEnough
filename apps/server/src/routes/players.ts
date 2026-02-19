import { gamesRepo, playersRepo, playerTagScoresRepo } from '@unfairenough/db';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '@unfairenough/shared';
import { sanitizeName } from '@unfairenough/ws-protocol';
import { Hono } from 'hono';
import { getDb } from '../db';

const players = new Hono();

// GET /api/players — list all player profiles
players.get('/', async (c) => {
  const db = getDb();
  const allPlayers = await playersRepo.listPlayers(db);
  return c.json({ players: allPlayers });
});

// POST /api/players — create admin-managed profile
players.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json<{
    displayName?: string;
    avatarColor?: string;
    avatarEmoji?: string;
  }>();

  const displayName = sanitizeName(body.displayName);
  if (!displayName) {
    return c.json({ error: 'Missing or empty "displayName"' }, 400);
  }

  const avatarColor = body.avatarColor;
  if (!avatarColor || !(AVATAR_COLORS as readonly string[]).includes(avatarColor)) {
    return c.json({ error: 'Invalid "avatarColor"' }, 400);
  }

  const avatarEmoji = body.avatarEmoji;
  if (!avatarEmoji || !(AVATAR_EMOJIS as readonly string[]).includes(avatarEmoji)) {
    return c.json({ error: 'Invalid "avatarEmoji"' }, 400);
  }

  const id = crypto.randomUUID();
  const profile = await playersRepo.createProfile(db, id, displayName, avatarColor, avatarEmoji);
  return c.json({ player: profile }, 201);
});

// PUT /api/players/:id — update profile fields
players.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const player = await playersRepo.getPlayer(db, id);
  if (!player) {
    return c.json({ error: 'Player not found' }, 404);
  }

  const body = await c.req.json<{
    displayName?: string;
    avatarColor?: string;
    avatarEmoji?: string;
  }>();

  const fields: { displayName?: string; avatarColor?: string; avatarEmoji?: string } = {};

  if (body.displayName !== undefined) {
    const name = sanitizeName(body.displayName);
    if (!name) return c.json({ error: 'Invalid "displayName"' }, 400);
    fields.displayName = name;
  }
  if (body.avatarColor !== undefined) {
    if (!(AVATAR_COLORS as readonly string[]).includes(body.avatarColor)) {
      return c.json({ error: 'Invalid "avatarColor"' }, 400);
    }
    fields.avatarColor = body.avatarColor;
  }
  if (body.avatarEmoji !== undefined) {
    if (!(AVATAR_EMOJIS as readonly string[]).includes(body.avatarEmoji)) {
      return c.json({ error: 'Invalid "avatarEmoji"' }, 400);
    }
    fields.avatarEmoji = body.avatarEmoji;
  }

  await playersRepo.updateProfile(db, id, fields);
  const updated = await playersRepo.getPlayer(db, id);
  return c.json({ player: updated });
});

// PUT /api/players/:id/unbind — remove device binding
players.put('/:id/unbind', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const player = await playersRepo.getPlayer(db, id);
  if (!player) {
    return c.json({ error: 'Player not found' }, 404);
  }
  await playersRepo.unbindDevice(db, id);
  return c.json({ message: 'Device unbound' });
});

// DELETE /api/players/:id — delete profile
players.delete('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const deleted = await playersRepo.deleteProfile(db, id);
  if (!deleted) {
    return c.json({ error: 'Player not found' }, 404);
  }
  return c.json({ message: 'Player deleted' });
});

// GET /api/players/:id/stats — player stats + recent games
players.get('/:id/stats', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const player = await playersRepo.getPlayer(db, id);
  if (!player) {
    return c.json({ error: 'Player not found' }, 404);
  }

  // Get recent games this player participated in
  const recentGames = await gamesRepo.getRecentGames(db, 50);
  const playerGames: Array<{
    gameId: string;
    roomCode: string;
    startedAt: string;
    endedAt: string | null;
    playerCount: number;
    isWinner: boolean;
  }> = [];

  for (const game of recentGames) {
    // Check if this player was the winner
    const isWinner = game.winnerPlayerId === id;
    // Only include games where this player participated
    const results = await gamesRepo.getGameResults(db, game.id);
    const participated = results.some((r) => r.playerId === id);
    if (!participated && !isWinner) continue;

    playerGames.push({
      gameId: game.id,
      roomCode: game.roomCode,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      playerCount: game.playerCount,
      isWinner,
    });
  }

  // Get tag scores
  const tagScores = await playerTagScoresRepo.getPlayerTagScores(db, id);
  const tagStats = tagScores.map((ts) => ({
    tag: ts.tag,
    score: ts.score,
    correct: ts.totalCorrect,
    incorrect: ts.totalIncorrect,
    gamesPlayed: ts.gamesPlayed,
  }));

  return c.json({
    player,
    tagScores: tagStats,
    recentGames: playerGames,
  });
});

// PUT /api/players/:id/tags — set a tag score for a player
players.put('/:id/tags', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const player = await playersRepo.getPlayer(db, id);
  if (!player) {
    return c.json({ error: 'Player not found' }, 404);
  }

  const body = await c.req.json<{ tag?: string; score?: number }>();
  const tag = body.tag?.toLowerCase().trim();
  if (!tag) {
    return c.json({ error: 'Missing "tag"' }, 400);
  }
  const score = typeof body.score === 'number' ? body.score : undefined;
  if (score === undefined) {
    return c.json({ error: 'Missing "score" (number)' }, 400);
  }

  await playerTagScoresRepo.setTagScore(db, id, tag, score);
  return c.json({ tag, score });
});

// DELETE /api/players/:id/tags/:tag — remove a tag score
players.delete('/:id/tags/:tag', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const tag = decodeURIComponent(c.req.param('tag'));
  const deleted = await playerTagScoresRepo.deleteTagScore(db, id, tag);
  if (!deleted) {
    return c.json({ error: 'Tag score not found' }, 404);
  }
  return c.json({ message: 'Tag score deleted' });
});

export default players;
