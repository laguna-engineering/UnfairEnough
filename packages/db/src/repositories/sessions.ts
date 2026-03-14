import type { DbAdapter } from '../adapter';
import type { Session, SessionRow, SessionType } from '../schema';

function rowToSession(row: SessionRow): Session {
  return {
    tokenHash: row.token_hash,
    hostId: row.host_id,
    type: row.type,
    deviceId: row.device_id,
    deviceInfo: row.device_info,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revoked: row.revoked === 1,
  };
}

export async function create(
  db: DbAdapter,
  tokenHash: string,
  hostId: string,
  type: SessionType,
  opts?: { deviceId?: string; deviceInfo?: string; expiresAt?: string },
): Promise<Session> {
  await db.run(
    `INSERT INTO sessions (token_hash, host_id, type, device_id, device_info, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      tokenHash,
      hostId,
      type,
      opts?.deviceId ?? null,
      opts?.deviceInfo ?? null,
      opts?.expiresAt ?? null,
    ],
  );
  const row = await db.get<SessionRow>('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash]);
  if (!row) throw new Error('BUG: session row missing after insert');
  return rowToSession(row);
}

const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function validate(
  db: DbAdapter,
  tokenHash: string,
): Promise<{ hostId: string; type: SessionType } | null> {
  const row = await db.get<SessionRow>(
    `SELECT host_id, type, last_seen_at FROM sessions
     WHERE token_hash = ?
       AND revoked = 0
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    [tokenHash],
  );
  if (!row) return null;

  // Only update last_seen_at if stale by more than 5 minutes
  const lastSeen = new Date(`${row.last_seen_at}Z`).getTime();
  if (Date.now() - lastSeen > LAST_SEEN_INTERVAL_MS) {
    await db.run("UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?", [
      tokenHash,
    ]);
  }

  return { hostId: row.host_id, type: row.type };
}

export async function revoke(db: DbAdapter, tokenHash: string): Promise<void> {
  await db.run('UPDATE sessions SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
}
