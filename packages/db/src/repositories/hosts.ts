import type { DbAdapter } from '../adapter';
import type { Host, HostRow } from '../schema';

function rowToHost(row: HostRow): Host {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export async function createHost(
  db: DbAdapter,
  id: string,
  email: string,
  passwordHash: string,
  displayName: string,
): Promise<Host> {
  await db.run('INSERT INTO hosts (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)', [
    id,
    email,
    passwordHash,
    displayName,
  ]);
  const row = await db.get<HostRow>('SELECT * FROM hosts WHERE id = ?', [id]);
  if (!row) throw new Error(`BUG: host row missing after insert (id=${id})`);
  return rowToHost(row);
}

export async function findByEmail(db: DbAdapter, email: string): Promise<Host | null> {
  const row = await db.get<HostRow>('SELECT * FROM hosts WHERE email = ?', [email]);
  return row ? rowToHost(row) : null;
}

export async function findByEmailWithHash(
  db: DbAdapter,
  email: string,
): Promise<{ host: Host; passwordHash: string } | null> {
  const row = await db.get<HostRow>('SELECT * FROM hosts WHERE email = ?', [email]);
  if (!row) return null;
  return { host: rowToHost(row), passwordHash: row.password_hash };
}

export async function findById(db: DbAdapter, id: string): Promise<Host | null> {
  const row = await db.get<HostRow>('SELECT * FROM hosts WHERE id = ?', [id]);
  return row ? rowToHost(row) : null;
}

export async function getPasswordHash(db: DbAdapter, email: string): Promise<string | null> {
  const row = await db.get<{ password_hash: string }>(
    'SELECT password_hash FROM hosts WHERE email = ?',
    [email],
  );
  return row?.password_hash ?? null;
}

export async function exists(db: DbAdapter): Promise<boolean> {
  const row = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM hosts');
  return (row?.cnt ?? 0) > 0;
}
