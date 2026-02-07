import type { DbAdapter } from '../adapter';
import type { GameRow, GameSession, GameType, RoundResultEntry, RoundResultRow } from '../schema';

function rowToGameSession(row: GameRow): GameSession {
  return {
    id: row.id,
    questionSetId: row.question_set_id,
    roomCode: row.room_code,
    gameType: row.game_type,
    playerCount: row.player_count,
    questionCount: row.question_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerPlayerId: row.winner_player_id,
    winnerName: row.winner_name,
  };
}

function rowToRoundResult(row: RoundResultRow): RoundResultEntry {
  return {
    id: row.id,
    gameId: row.game_id,
    questionId: row.question_id,
    roundNumber: row.round_number,
    playerId: row.player_id,
    playerName: row.player_name,
    answer: row.answer,
    isCorrect: row.is_correct === 1,
    responseTimeMs: row.response_time_ms,
    pointsEarned: row.points_earned,
    totalScore: row.total_score,
    rank: row.rank,
  };
}

export async function createGame(
  db: DbAdapter,
  id: string,
  roomCode: string,
  gameType: GameType,
  playerCount: number,
  questionCount: number,
  questionSetId?: string,
): Promise<GameSession> {
  await db.run(
    `INSERT INTO games (id, room_code, game_type, player_count, question_count, question_set_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, roomCode, gameType, playerCount, questionCount, questionSetId ?? null],
  );
  const row = await db.get<GameRow>('SELECT * FROM games WHERE id = ?', [id]);
  return rowToGameSession(row!);
}

export async function endGame(
  db: DbAdapter,
  gameId: string,
  winnerPlayerId: string | null,
  winnerName: string | null,
): Promise<void> {
  await db.run(
    "UPDATE games SET ended_at = datetime('now'), winner_player_id = ?, winner_name = ? WHERE id = ?",
    [winnerPlayerId, winnerName, gameId],
  );
}

export interface RoundResultInsert {
  questionId: string;
  roundNumber: number;
  playerId: string;
  playerName: string;
  answer: string | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  pointsEarned: number;
  totalScore: number;
  rank: number;
}

export async function insertRoundResults(
  db: DbAdapter,
  gameId: string,
  results: RoundResultInsert[],
): Promise<void> {
  for (const r of results) {
    await db.run(
      `INSERT INTO round_results (game_id, question_id, round_number, player_id, player_name,
        answer, is_correct, response_time_ms, points_earned, total_score, rank)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        r.questionId,
        r.roundNumber,
        r.playerId,
        r.playerName,
        r.answer,
        r.isCorrect ? 1 : 0,
        r.responseTimeMs,
        r.pointsEarned,
        r.totalScore,
        r.rank,
      ],
    );
  }
}

export async function getGame(db: DbAdapter, gameId: string): Promise<GameSession | null> {
  const row = await db.get<GameRow>('SELECT * FROM games WHERE id = ?', [gameId]);
  return row ? rowToGameSession(row) : null;
}

export async function getRecentGames(db: DbAdapter, limit = 20): Promise<GameSession[]> {
  const rows = await db.all<GameRow>('SELECT * FROM games ORDER BY started_at DESC LIMIT ?', [
    limit,
  ]);
  return rows.map(rowToGameSession);
}

export async function getGameResults(db: DbAdapter, gameId: string): Promise<RoundResultEntry[]> {
  const rows = await db.all<RoundResultRow>(
    'SELECT * FROM round_results WHERE game_id = ? ORDER BY round_number, rank',
    [gameId],
  );
  return rows.map(rowToRoundResult);
}
