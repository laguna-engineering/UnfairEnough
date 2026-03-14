import type { DbAdapter } from '@unfairenough/db';
import { hostsRepo, sessionsRepo } from '@unfairenough/db';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { hashToken } from './tokens';

export type AuthVariables = {
  hostId: string | null;
};

let tenancyEnabled = false;
let tenancyCheckedAt = 0;
const TENANCY_CACHE_TTL_MS = 60_000;

/**
 * Check if any host accounts exist.
 * Once true, stays true permanently (creating the first account is irreversible
 * in normal operation). Re-checks from DB every 60s while false, so the server
 * picks up new accounts created via CLI without a restart.
 */
export async function isTenancyEnabled(db: DbAdapter): Promise<boolean> {
  if (tenancyEnabled) return true;
  const now = Date.now();
  if (now - tenancyCheckedAt < TENANCY_CACHE_TTL_MS) return false;
  tenancyEnabled = await hostsRepo.exists(db);
  tenancyCheckedAt = now;
  return tenancyEnabled;
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

/**
 * Force re-check of tenancy state on next request.
 * Called by routes/auth.ts after account creation so the server
 * picks up the new account immediately instead of waiting for the TTL.
 */
export function refreshTenancyFlag(): void {
  tenancyEnabled = false;
  tenancyCheckedAt = 0;
}

type GetDb = () => DbAdapter;

/**
 * Create auth middleware bound to the server's DB getter.
 * Call once at startup and reuse the returned middleware.
 */
export function createAuthMiddleware(getDb: GetDb) {
  /**
   * Scopes requests by host when tenancy is enabled,
   * or allows unscoped access when no accounts exist.
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

  return { scopedAuth };
}
