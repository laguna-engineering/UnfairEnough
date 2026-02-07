import type { DbAdapter } from '../adapter';
import type { PlayerRow, PlayerProfile } from '../schema';

function rowToProfile(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    deviceId: row.device_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    totalGames: row.total_games,
    totalWins: row.total_wins,
    totalScore: row.total_score,
  };
}

export async function findByDeviceId(
  db: DbAdapter,
  deviceId: string,
): Promise<PlayerProfile | null> {
  const row = await db.get<PlayerRow>(
    'SELECT * FROM players WHERE device_id = ?',
    [deviceId],
  );
  return row ? rowToProfile(row) : null;
}

export async function getPlayer(
  db: DbAdapter,
  playerId: string,
): Promise<PlayerProfile | null> {
  const row = await db.get<PlayerRow>(
    'SELECT * FROM players WHERE id = ?',
    [playerId],
  );
  return row ? rowToProfile(row) : null;
}

export async function createPlayer(
  db: DbAdapter,
  id: string,
  displayName: string,
  avatarColor: string,
  deviceId?: string,
): Promise<PlayerProfile> {
  await db.run(
    `INSERT INTO players (id, device_id, display_name, avatar_color)
     VALUES (?, ?, ?, ?)`,
    [id, deviceId ?? null, displayName, avatarColor],
  );
  const profile = await getPlayer(db, id);
  return profile!;
}

export async function updateDisplayName(
  db: DbAdapter,
  playerId: string,
  displayName: string,
): Promise<void> {
  await db.run(
    "UPDATE players SET display_name = ?, last_seen_at = datetime('now') WHERE id = ?",
    [displayName, playerId],
  );
}

export async function updateLastSeen(
  db: DbAdapter,
  playerId: string,
): Promise<void> {
  await db.run(
    "UPDATE players SET last_seen_at = datetime('now') WHERE id = ?",
    [playerId],
  );
}

export async function incrementGames(
  db: DbAdapter,
  playerId: string,
  scoreEarned: number,
): Promise<void> {
  await db.run(
    "UPDATE players SET total_games = total_games + 1, total_score = total_score + ?, last_seen_at = datetime('now') WHERE id = ?",
    [scoreEarned, playerId],
  );
}

export async function incrementWins(
  db: DbAdapter,
  playerId: string,
): Promise<void> {
  await db.run(
    'UPDATE players SET total_wins = total_wins + 1 WHERE id = ?',
    [playerId],
  );
}

export async function listPlayers(db: DbAdapter): Promise<PlayerProfile[]> {
  const rows = await db.all<PlayerRow>(
    'SELECT * FROM players ORDER BY last_seen_at DESC',
  );
  return rows.map(rowToProfile);
}
