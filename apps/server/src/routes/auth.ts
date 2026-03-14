import { hostsRepo, sessionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { refreshTenancyFlag } from '../auth/middleware';
import { generateSecureToken, hashToken } from '../auth/tokens';
import { getDb } from '../db';

const SESSION_COOKIE = 'ue_session';
const ADMIN_SESSION_TTL_DAYS = 7;

const auth = new Hono();

// POST /auth/login — email + password → set session cookie
auth.post('/login', async (c) => {
  const db = getDb();
  const body = await c.req
    .json<{ email?: string; password?: string }>()
    .catch(() => ({ email: undefined, password: undefined }));
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // Look up host
  const host = await hostsRepo.findByEmail(db, email);
  if (!host) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Verify password
  const passwordHash = await hostsRepo.getPasswordHash(db, email);
  if (!passwordHash) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await Bun.password.verify(password, passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Create session
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');

  await sessionsRepo.create(db, tokenHash, host.id, 'host_admin', {
    deviceInfo: c.req.header('User-Agent') ?? undefined,
    expiresAt,
  });

  // Set HttpOnly cookie
  setCookie(c, SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60,
    secure: c.req.url.startsWith('https'),
  });

  return c.json({ host: { id: host.id, email: host.email, displayName: host.displayName } });
});

// POST /auth/logout — revoke session, clear cookie
auth.post('/logout', async (c) => {
  const db = getDb();
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await sessionsRepo.revoke(db, hashToken(token));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
  }
  return c.json({ message: 'Logged out' });
});

// GET /auth/me — validate session, return host info
auth.get('/me', async (c) => {
  const db = getDb();
  const token =
    c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? getCookie(c, SESSION_COOKIE);

  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const session = await sessionsRepo.validate(db, hashToken(token));
  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  const host = await hostsRepo.findById(db, session.hostId);
  if (!host) {
    return c.json({ error: 'Host account not found' }, 401);
  }

  return c.json({
    host: { id: host.id, email: host.email, displayName: host.displayName },
    sessionType: session.type,
  });
});

export { refreshTenancyFlag };
export default auth;
