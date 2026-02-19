import type { DbAdapter, SqlValue } from '../adapter';
import type { PlayerProfile, PlayerRow } from '../schema';

function rowToProfile(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    deviceId: row.device_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarEmoji: row.avatar_emoji,
    source: row.source,
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
  const row = await db.get<PlayerRow>('SELECT * FROM players WHERE device_id = ?', [deviceId]);
  return row ? rowToProfile(row) : null;
}

export async function getPlayer(db: DbAdapter, playerId: string): Promise<PlayerProfile | null> {
  const row = await db.get<PlayerRow>('SELECT * FROM players WHERE id = ?', [playerId]);
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
  await db.run("UPDATE players SET display_name = ?, last_seen_at = datetime('now') WHERE id = ?", [
    displayName,
    playerId,
  ]);
}

export async function updateLastSeen(db: DbAdapter, playerId: string): Promise<void> {
  await db.run("UPDATE players SET last_seen_at = datetime('now') WHERE id = ?", [playerId]);
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

export async function incrementWins(db: DbAdapter, playerId: string): Promise<void> {
  await db.run('UPDATE players SET total_wins = total_wins + 1 WHERE id = ?', [playerId]);
}

export async function listPlayers(db: DbAdapter): Promise<PlayerProfile[]> {
  const rows = await db.all<PlayerRow>('SELECT * FROM players ORDER BY last_seen_at DESC');
  return rows.map(rowToProfile);
}

/** Create an admin-managed profile (no device binding). */
export async function createProfile(
  db: DbAdapter,
  id: string,
  displayName: string,
  avatarColor: string,
  avatarEmoji: string,
): Promise<PlayerProfile> {
  await db.run(
    `INSERT INTO players (id, display_name, avatar_color, avatar_emoji, source)
     VALUES (?, ?, ?, ?, 'admin')`,
    [id, displayName, avatarColor, avatarEmoji],
  );
  const profile = await getPlayer(db, id);
  return profile!;
}

/** Update an existing profile's display fields. */
export async function updateProfile(
  db: DbAdapter,
  id: string,
  fields: { displayName?: string; avatarColor?: string; avatarEmoji?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: SqlValue[] = [];

  if (fields.displayName !== undefined) {
    sets.push('display_name = ?');
    params.push(fields.displayName);
  }
  if (fields.avatarColor !== undefined) {
    sets.push('avatar_color = ?');
    params.push(fields.avatarColor);
  }
  if (fields.avatarEmoji !== undefined) {
    sets.push('avatar_emoji = ?');
    params.push(fields.avatarEmoji);
  }

  if (sets.length === 0) return;

  params.push(id);
  await db.run(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** Remove the device binding from a profile. */
export async function unbindDevice(db: DbAdapter, playerId: string): Promise<void> {
  await db.run('UPDATE players SET device_id = NULL WHERE id = ?', [playerId]);
}

/**
 * Atomically claim an unbound profile for a device.
 * Returns true if the claim succeeded, false if already claimed.
 */
export async function claimProfile(
  db: DbAdapter,
  profileId: string,
  deviceId: string,
): Promise<boolean> {
  // First unbind any other profile this device may have
  await db.run('UPDATE players SET device_id = NULL WHERE device_id = ?', [deviceId]);
  // Atomically claim the target profile only if it's unbound
  const result = await db.run(
    'UPDATE players SET device_id = ? WHERE id = ? AND device_id IS NULL',
    [deviceId, profileId],
  );
  return result.changes > 0;
}

/** List admin-created profiles that are not bound to any device. */
export async function listAvailableProfiles(db: DbAdapter): Promise<PlayerProfile[]> {
  const rows = await db.all<PlayerRow>(
    "SELECT * FROM players WHERE source = 'admin' AND device_id IS NULL ORDER BY display_name ASC",
  );
  return rows.map(rowToProfile);
}

/** Delete a profile and cascade-delete its tag scores. */
export async function deleteProfile(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM players WHERE id = ?', [id]);
  return result.changes > 0;
}
