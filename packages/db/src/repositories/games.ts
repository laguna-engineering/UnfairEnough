import type { DbAdapter, SqlValue } from '../adapter';
import type { GameRow, GameSession, GameType, RoundResultEntry, RoundResultRow } from '../schema';

function rowToGameSession(row: GameRow): GameSession {
  return {
    id: row.id,
    questionSetId: row.question_set_id,
    questionSetIds: row.question_set_ids ? JSON.parse(row.question_set_ids) : null,
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
    profileId: row.profile_id,
  };
}

export async function createGame(
  db: DbAdapter,
  id: string,
  roomCode: string,
  gameType: GameType,
  playerCount: number,
  questionCount: number,
  hostId: string | null,
  questionSetId?: string,
  questionSetIds?: string[],
): Promise<GameSession> {
  await db.run(
    `INSERT INTO games (id, room_code, game_type, player_count, question_count, question_set_id, question_set_ids, host_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      roomCode,
      gameType,
      playerCount,
      questionCount,
      questionSetId ?? null,
      questionSetIds ? JSON.stringify(questionSetIds) : null,
      hostId,
    ],
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
  profileId?: string | null;
}

export async function insertRoundResults(
  db: DbAdapter,
  gameId: string,
  results: RoundResultInsert[],
): Promise<void> {
  for (const r of results) {
    await db.run(
      `INSERT INTO round_results (game_id, question_id, round_number, player_id, player_name,
        answer, is_correct, response_time_ms, points_earned, total_score, rank, profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        r.profileId ?? null,
      ],
    );
  }
}

export async function getGame(
  db: DbAdapter,
  gameId: string,
  hostId?: string | null,
): Promise<GameSession | null> {
  let sql = 'SELECT * FROM games WHERE id = ?';
  const params: SqlValue[] = [gameId];
  if (hostId !== undefined && hostId !== null) {
    sql += ' AND host_id = ?';
    params.push(hostId);
  } else if (hostId === null) {
    sql += ' AND host_id IS NULL';
  }
  const row = await db.get<GameRow>(sql, params);
  return row ? rowToGameSession(row) : null;
}

export async function getRecentGames(
  db: DbAdapter,
  hostId: string | null,
  limit = 20,
): Promise<GameSession[]> {
  const sql =
    hostId !== null
      ? 'SELECT * FROM games WHERE host_id = ? ORDER BY started_at DESC LIMIT ?'
      : 'SELECT * FROM games WHERE host_id IS NULL ORDER BY started_at DESC LIMIT ?';
  const params: SqlValue[] = hostId !== null ? [hostId, limit] : [limit];
  const rows = await db.all<GameRow>(sql, params);
  return rows.map(rowToGameSession);
}

export async function getGameResults(db: DbAdapter, gameId: string): Promise<RoundResultEntry[]> {
  const rows = await db.all<RoundResultRow>(
    'SELECT * FROM round_results WHERE game_id = ? ORDER BY round_number, rank',
    [gameId],
  );
  return rows.map(rowToRoundResult);
}
