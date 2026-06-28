import type { DbAdapter, SqlValue } from '../adapter';
import type { PlayerProfile, PlayerRow } from '../schema';
import { hostScope } from '../utils';

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
  const { clause, params: scopeParams } = hostScope(hostId);
  const row = await db.get<PlayerRow>(`SELECT * FROM players WHERE device_id = ? AND ${clause}`, [
    deviceId,
    ...scopeParams,
  ]);
  return row ? rowToProfile(row) : null;
}

export async function getPlayer(
  db: DbAdapter,
  playerId: string,
  hostId?: string | null,
): Promise<PlayerProfile | null> {
  let sql = 'SELECT * FROM players WHERE id = ?';
  const params: SqlValue[] = [playerId];
  // When hostId is provided (not undefined), enforce ownership
  if (hostId !== undefined && hostId !== null) {
    sql += ' AND host_id = ?';
    params.push(hostId);
  } else if (hostId === null) {
    sql += ' AND host_id IS NULL';
  }
  const row = await db.get<PlayerRow>(sql, params);
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
  if (!profile) throw new Error(`BUG: player row missing after insert (id=${id})`);
  return profile;
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
  const { clause, params } = hostScope(hostId);
  const rows = await db.all<PlayerRow>(
    `SELECT * FROM players WHERE ${clause} ORDER BY last_seen_at DESC`,
    params,
  );
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
  if (!profile) throw new Error(`BUG: player profile missing after insert (id=${id})`);
  return profile;
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
 * Scoped by hostId to prevent cross-tenant profile claiming.
 *
 * Wrapped in a transaction so the old binding is preserved if the claim fails.
 */
export async function claimProfile(
  db: DbAdapter,
  profileId: string,
  deviceId: string,
  hostId: string | null,
): Promise<boolean> {
  return db.transaction(async () => {
    const { clause, params: scopeParams } = hostScope(hostId);

    const target = await db.get<{ id: string; device_id: string | null }>(
      `SELECT id, device_id FROM players WHERE id = ? AND ${clause}`,
      [profileId, ...scopeParams],
    );
    if (!target) return false;
    if (target.device_id === deviceId) return true;
    if (target.device_id !== null) return false;

    const existingForDevice = await db.get<{ id: string }>(
      `SELECT id FROM players WHERE device_id = ? AND ${clause}`,
      [deviceId, ...scopeParams],
    );

    if (existingForDevice) {
      await db.run('UPDATE players SET device_id = NULL WHERE id = ?', [existingForDevice.id]);
    }

    const result = await db.run(
      `UPDATE players SET device_id = ? WHERE id = ? AND device_id IS NULL AND ${clause}`,
      [deviceId, profileId, ...scopeParams],
    );

    if (result.changes > 0) return true;

    // Race: someone else claimed the target after we checked it. Restore the
    // previous binding so a failed claim doesn't leave this device unassigned.
    if (existingForDevice) {
      await db.run('UPDATE players SET device_id = ? WHERE id = ? AND device_id IS NULL', [
        deviceId,
        existingForDevice.id,
      ]);
    }
    return false;
  });
}

/** List admin-created profiles that are not bound to any device. */
export async function listAvailableProfiles(
  db: DbAdapter,
  hostId: string | null,
): Promise<PlayerProfile[]> {
  const { clause, params } = hostScope(hostId);
  const rows = await db.all<PlayerRow>(
    `SELECT * FROM players WHERE source = 'admin' AND device_id IS NULL AND ${clause} ORDER BY display_name ASC`,
    params,
  );
  return rows.map(rowToProfile);
}

/** Delete a profile and cascade-delete its tag scores. */
export async function deleteProfile(
  db: DbAdapter,
  id: string,
  hostId?: string | null,
): Promise<boolean> {
  let sql = 'DELETE FROM players WHERE id = ?';
  const params: SqlValue[] = [id];
  if (hostId !== undefined && hostId !== null) {
    sql += ' AND host_id = ?';
    params.push(hostId);
  } else if (hostId === null) {
    sql += ' AND host_id IS NULL';
  }
  const result = await db.run(sql, params);
  return result.changes > 0;
}
