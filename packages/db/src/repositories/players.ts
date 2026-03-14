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
  hostId: string | null,
): Promise<PlayerProfile | null> {
  const sql =
    hostId !== null
      ? 'SELECT * FROM players WHERE device_id = ? AND host_id = ?'
      : 'SELECT * FROM players WHERE device_id = ? AND host_id IS NULL';
  const params: SqlValue[] = hostId !== null ? [deviceId, hostId] : [deviceId];
  const row = await db.get<PlayerRow>(sql, params);
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
  hostId: string | null,
  deviceId?: string,
): Promise<PlayerProfile> {
  await db.run(
    `INSERT INTO players (id, device_id, display_name, avatar_color, host_id)
     VALUES (?, ?, ?, ?, ?)`,
    [id, deviceId ?? null, displayName, avatarColor, hostId],
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

export async function listPlayers(db: DbAdapter, hostId: string | null): Promise<PlayerProfile[]> {
  const sql =
    hostId !== null
      ? 'SELECT * FROM players WHERE host_id = ? ORDER BY last_seen_at DESC'
      : 'SELECT * FROM players WHERE host_id IS NULL ORDER BY last_seen_at DESC';
  const params: SqlValue[] = hostId !== null ? [hostId] : [];
  const rows = await db.all<PlayerRow>(sql, params);
  return rows.map(rowToProfile);
}

/** Create an admin-managed profile (no device binding). */
export async function createProfile(
  db: DbAdapter,
  id: string,
  displayName: string,
  avatarColor: string,
  avatarEmoji: string,
  hostId: string | null,
): Promise<PlayerProfile> {
  await db.run(
    `INSERT INTO players (id, display_name, avatar_color, avatar_emoji, source, host_id)
     VALUES (?, ?, ?, ?, 'admin', ?)`,
    [id, displayName, avatarColor, avatarEmoji, hostId],
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
 * Scoped by hostId to avoid unbinding from other hosts.
 */
export async function claimProfile(
  db: DbAdapter,
  profileId: string,
  deviceId: string,
  hostId: string | null,
): Promise<boolean> {
  // Unbind any other profile this device has within the SAME host
  if (hostId !== null) {
    await db.run('UPDATE players SET device_id = NULL WHERE device_id = ? AND host_id = ?', [
      deviceId,
      hostId,
    ]);
  } else {
    await db.run('UPDATE players SET device_id = NULL WHERE device_id = ? AND host_id IS NULL', [
      deviceId,
    ]);
  }
  // Atomically claim the target profile only if it's unbound
  const result = await db.run(
    'UPDATE players SET device_id = ? WHERE id = ? AND device_id IS NULL',
    [deviceId, profileId],
  );
  return result.changes > 0;
}

/** List admin-created profiles that are not bound to any device. */
export async function listAvailableProfiles(
  db: DbAdapter,
  hostId: string | null,
): Promise<PlayerProfile[]> {
  const sql =
    hostId !== null
      ? "SELECT * FROM players WHERE source = 'admin' AND device_id IS NULL AND host_id = ? ORDER BY display_name ASC"
      : "SELECT * FROM players WHERE source = 'admin' AND device_id IS NULL AND host_id IS NULL ORDER BY display_name ASC";
  const params: SqlValue[] = hostId !== null ? [hostId] : [];
  const rows = await db.all<PlayerRow>(sql, params);
  return rows.map(rowToProfile);
}

/** Delete a profile and cascade-delete its tag scores. */
export async function deleteProfile(db: DbAdapter, id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM players WHERE id = ?', [id]);
  return result.changes > 0;
}
