import type { DbAdapter } from '@unfairenough/db';
import { hostsRepo, sessionsRepo } from '@unfairenough/db';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { hashToken } from './tokens';

export type AuthVariables = {
  hostId: string | null;
};

let tenancyEnabled: boolean | null = null;

/** Check if any host accounts exist (cached). */
export async function isTenancyEnabled(db: DbAdapter): Promise<boolean> {
  if (tenancyEnabled !== null) return tenancyEnabled;
  tenancyEnabled = await hostsRepo.exists(db);
  return tenancyEnabled;
}

/** Refresh the tenancy flag (call after creating an account via CLI). */
export function refreshTenancyFlag(): void {
  tenancyEnabled = null;
}

/**
 * Extract token from Authorization header (case-insensitive Bearer)
 * or session cookie. Does NOT fall through to cookie if auth header is
 * present but malformed.
 */
function extractToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].length <= 128) return match[1];
    return null;
  }
  const cookie = getCookie(c, 'session');
  return cookie && cookie.length <= 128 ? cookie : null;
}

type GetDb = () => DbAdapter;

/**
 * Create auth middleware bound to the server's DB getter.
 * Call once at startup and reuse the returned middleware.
 */
export function createAuthMiddleware(getDb: GetDb) {
  /** For routes that REQUIRE authentication (always, regardless of tenancy mode). */
  const requireHostAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = extractToken(c);
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    const session = await sessionsRepo.validate(getDb(), hashToken(token));
    if (!session) return c.json({ error: 'Invalid session' }, 401);
    c.set('hostId', session.hostId);
    await next();
  });

  /**
   * For routes that scope by host when tenancy is enabled,
   * or allow unscoped access when no accounts exist.
   *
   * CRITICAL: Never silently degrades from scoped to unscoped on invalid tokens.
   * If a token is present but invalid → 401.
   * If no token and tenancy enabled → 401.
   */
  const scopedAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const db = getDb();
    const token = extractToken(c);

    if (await isTenancyEnabled(db)) {
      if (!token) return c.json({ error: 'Unauthorized' }, 401);
      const session = await sessionsRepo.validate(db, hashToken(token));
      if (!session) return c.json({ error: 'Invalid session' }, 401);
      c.set('hostId', session.hostId);
    } else {
      c.set('hostId', null);
    }
    await next();
  });

  return { requireHostAuth, scopedAuth };
}
