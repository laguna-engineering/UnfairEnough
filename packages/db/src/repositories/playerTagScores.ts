import type { DbAdapter, SqlValue } from '../adapter';
import type { PlayerTagScore, PlayerTagScoreRow } from '../schema';

function rowToTagScore(row: PlayerTagScoreRow): PlayerTagScore {
  return {
    id: row.id,
    playerId: row.player_id,
    tag: row.tag,
    score: row.score,
    totalCorrect: row.total_correct,
    totalIncorrect: row.total_incorrect,
    gamesPlayed: row.games_played,
    lastUpdated: row.last_updated,
  };
}

export async function getPlayerTagScores(
  db: DbAdapter,
  playerId: string,
): Promise<PlayerTagScore[]> {
  const rows = await db.all<PlayerTagScoreRow>(
    'SELECT * FROM player_tag_scores WHERE player_id = ? ORDER BY score DESC',
    [playerId],
  );
  return rows.map(rowToTagScore);
}

export async function getTagScoresForPlayers(
  db: DbAdapter,
  playerIds: string[],
): Promise<Map<string, PlayerTagScore[]>> {
  if (playerIds.length === 0) return new Map();

  const placeholders = playerIds.map(() => '?').join(', ');
  const rows = await db.all<PlayerTagScoreRow>(
    `SELECT * FROM player_tag_scores WHERE player_id IN (${placeholders}) ORDER BY player_id, score DESC`,
    playerIds,
  );

  const result = new Map<string, PlayerTagScore[]>();
  for (const id of playerIds) {
    result.set(id, []);
  }
  for (const row of rows) {
    const scores = result.get(row.player_id);
    if (scores) {
      scores.push(rowToTagScore(row));
    }
  }
  return result;
}

export async function upsertTagScore(
  db: DbAdapter,
  id: string,
  playerId: string,
  tag: string,
  delta: number,
  isCorrect: boolean,
  hostId: string | null,
  initialScore = 0,
): Promise<void> {
  await db.run(
    `INSERT INTO player_tag_scores (id, player_id, tag, score, total_correct, total_incorrect, host_id, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(player_id, tag) DO UPDATE SET
       score = score + ?,
       total_correct = total_correct + ?,
       total_incorrect = total_incorrect + ?,
       last_updated = datetime('now')`,
    [
      id,
      playerId,
      tag,
      initialScore + delta,
      isCorrect ? 1 : 0,
      isCorrect ? 0 : 1,
      hostId,
      delta,
      isCorrect ? 1 : 0,
      isCorrect ? 0 : 1,
    ],
  );
}

export async function incrementGamesPlayed(db: DbAdapter, playerId: string): Promise<void> {
  await db.run(
    `UPDATE player_tag_scores SET games_played = games_played + 1, last_updated = datetime('now')
     WHERE player_id = ?`,
    [playerId],
  );
}

export async function setTagScore(
  db: DbAdapter,
  playerId: string,
  tag: string,
  score: number,
  hostId: string | null,
): Promise<void> {
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO player_tag_scores (id, player_id, tag, score, total_correct, total_incorrect, host_id, last_updated)
     VALUES (?, ?, ?, ?, 0, 0, ?, datetime('now'))
     ON CONFLICT(player_id, tag) DO UPDATE SET
       score = ?,
       last_updated = datetime('now')`,
    [id, playerId, tag, score, hostId, score],
  );
}

export async function deleteTagScore(
  db: DbAdapter,
  playerId: string,
  tag: string,
): Promise<boolean> {
  const result = await db.run('DELETE FROM player_tag_scores WHERE player_id = ? AND tag = ?', [
    playerId,
    tag,
  ]);
  return result.changes > 0;
}

export async function getScoresByTag(
  db: DbAdapter,
  tag: string,
  hostId: string | null,
): Promise<PlayerTagScore[]> {
  const sql =
    hostId !== null
      ? 'SELECT * FROM player_tag_scores WHERE tag = ? AND host_id = ? ORDER BY score DESC'
      : 'SELECT * FROM player_tag_scores WHERE tag = ? AND host_id IS NULL ORDER BY score DESC';
  const params: SqlValue[] = hostId !== null ? [tag, hostId] : [tag];
  const rows = await db.all<PlayerTagScoreRow>(sql, params);
  return rows.map(rowToTagScore);
}

export async function getAllTags(
  db: DbAdapter,
  hostId: string | null,
): Promise<Array<{ tag: string; playerCount: number }>> {
  const sql =
    hostId !== null
      ? `SELECT tag, COUNT(DISTINCT player_id) as player_count
       FROM player_tag_scores WHERE host_id = ?
       GROUP BY tag ORDER BY player_count DESC`
      : `SELECT tag, COUNT(DISTINCT player_id) as player_count
       FROM player_tag_scores WHERE host_id IS NULL
       GROUP BY tag ORDER BY player_count DESC`;
  const params: SqlValue[] = hostId !== null ? [hostId] : [];
  const rows = await db.all<{ tag: string; player_count: number }>(sql, params);
  return rows.map((r) => ({ tag: r.tag, playerCount: r.player_count }));
}
