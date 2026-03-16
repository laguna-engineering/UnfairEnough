import type { DbAdapter } from '../adapter';
import type { InvitationTokenRow } from '../schema';

export async function create(
  db: DbAdapter,
  tokenHash: string,
  hostId: string,
  roomCode: string,
  ttlHours = 24,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
  await db.run(
    'INSERT INTO invitation_tokens (token_hash, host_id, room_code, expires_at) VALUES (?, ?, ?, ?)',
    [tokenHash, hostId, roomCode, expiresAt],
  );
}

export async function validate(
  db: DbAdapter,
  tokenHash: string,
): Promise<{ hostId: string; roomCode: string } | null> {
  const row = await db.get<InvitationTokenRow>(
    "SELECT * FROM invitation_tokens WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))",
    [tokenHash],
  );
  return row ? { hostId: row.host_id, roomCode: row.room_code } : null;
}

export async function removeByRoom(db: DbAdapter, roomCode: string): Promise<void> {
  await db.run('DELETE FROM invitation_tokens WHERE room_code = ?', [roomCode]);
}

export async function cleanup(db: DbAdapter): Promise<number> {
  const result = await db.run(
    "DELETE FROM invitation_tokens WHERE expires_at IS NOT NULL AND expires_at < datetime('now')",
  );
  return result.changes;
}
