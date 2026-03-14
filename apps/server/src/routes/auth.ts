import { hostsRepo, sessionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { extractToken, SESSION_COOKIE } from '../auth/middleware';
import { generateSecureToken, hashToken } from '../auth/tokens';
import { getDb } from '../db';

const ADMIN_SESSION_TTL_DAYS = 7;

// ── Login rate limiting ─────────────────────────────────────
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

function isRateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

function resetRateLimit(key: string): void {
  loginAttempts.delete(key);
}

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

  // Rate limiting
  const ip = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(`ip:${ip}`, MAX_ATTEMPTS_PER_IP)) {
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }
  if (isRateLimited(`email:${email}`, MAX_ATTEMPTS_PER_EMAIL)) {
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }

  // Look up host and password hash in a single query
  const result = await hostsRepo.findByEmailWithHash(db, email);
  if (!result) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  const { host, passwordHash } = result;

  const valid = await Bun.password.verify(password, passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Reset rate limit on successful login
  resetRateLimit(`email:${email}`);
  resetRateLimit(`ip:${ip}`);

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
    secure: c.req.url.startsWith('https') || c.req.header('X-Forwarded-Proto') === 'https',
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
  const token = extractToken(c);

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

export default auth;
