import { gamesRepo, playersRepo, playerTagScoresRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { getDb } from '../db';

const players = new Hono();

// GET /api/players — list all player profiles
players.get('/', async (c) => {
  const db = getDb();
  const allPlayers = await playersRepo.listPlayers(db);
  return c.json({ players: allPlayers });
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

export default players;
