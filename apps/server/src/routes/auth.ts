import { hostsRepo, invitationTokensRepo, playersRepo, sessionsRepo } from '@unfairenough/db';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { refreshTenancyFlag } from '../auth/middleware';
import { approvePendingLogin, removePendingLogin } from '../auth/pendingLogins';
import { generateSecureToken, hashToken } from '../auth/tokens';
import { getDb } from '../db';
import { createRoom, destroyRoom, findRoomByHostId } from '../roomManager';
import type { WSData } from '../types';

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

// POST /auth/logout — revoke session, clear cookie. Works for admin cookies and Bearer tokens (guest sessions).
auth.post('/logout', async (c) => {
  const db = getDb();
  // Check Bearer token first (mobile guest sessions), then cookie (admin sessions)
  const bearerToken = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const cookieToken = getCookie(c, SESSION_COOKIE);
  const token = bearerToken ?? cookieToken;

  if (token) {
    // If it's a guest session, unbind the device from the player profile
    const tokenHash = hashToken(token);
    const session = await sessionsRepo.validate(db, tokenHash);
    if (session?.type === 'guest') {
      const sessionRow = await db.get<{ device_id: string | null }>(
        'SELECT device_id FROM sessions WHERE token_hash = ? AND revoked = 0',
        [tokenHash],
      );
      if (sessionRow?.device_id) {
        const player = await playersRepo.findByDeviceId(db, sessionRow.device_id, session.hostId);
        if (player) {
          await playersRepo.unbindDevice(db, player.id);
        }
      }
    }

    await sessionsRepo.revoke(db, tokenHash);

    if (cookieToken) {
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
    }
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

  const result: Record<string, unknown> = {
    host: { id: host.id, email: host.email, displayName: host.displayName },
    sessionType: session.type,
  };

  // For guest sessions, also return the linked player info
  if (session.type === 'guest') {
    const sessionRow = await db.get<{ device_id: string | null }>(
      'SELECT device_id FROM sessions WHERE token_hash = ? AND revoked = 0',
      [hashToken(token)],
    );
    if (sessionRow?.device_id) {
      const player = await playersRepo.findByDeviceId(db, sessionRow.device_id, session.hostId);
      if (player) {
        result.player = {
          displayName: player.displayName,
          avatarColor: player.avatarColor,
          avatarEmoji: player.avatarEmoji,
        };
      }
    }
  }

  return c.json(result);
});

// GET /auth/tv-login — serve the TV login approval page
auth.get('/tv-login', async (c) => {
  // Serve the static HTML page (Bun reads the file)
  const file = Bun.file('./admin/tv-login.html');
  if (!(await file.exists())) {
    return c.text('TV login page not found', 404);
  }
  return new Response(file, { headers: { 'Content-Type': 'text/html' } });
});

// POST /auth/tv-login — device-flow approval: validates credentials, pushes AUTH_SUCCESS to TV WS
auth.post('/tv-login', async (c) => {
  const db = getDb();
  const body = await c.req
    .json<{ code?: string; email?: string; password?: string }>()
    .catch(() => ({ code: undefined, email: undefined, password: undefined }));

  const code = body.code?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!code || !email || !password) {
    return c.json({ error: 'Code, email, and password are required' }, 400);
  }

  // Verify credentials
  const host = await hostsRepo.findByEmail(db, email);
  if (!host) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const passwordHash = await hostsRepo.getPasswordHash(db, email);
  if (!passwordHash) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await Bun.password.verify(password, passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Approve the pending login
  const pending = approvePendingLogin(code, host.id);
  if (!pending) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  // Create a TV session token (365-day TTL)
  const TV_SESSION_TTL_DAYS = 365;
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TV_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');

  await sessionsRepo.create(db, tokenHash, host.id, 'host_tv', {
    deviceInfo: 'TV Host',
    expiresAt,
  });

  // Enforce one TV per host — destroy existing room if any
  const existingRoom = findRoomByHostId(host.id);
  if (existingRoom) {
    destroyRoom(existingRoom);
  }

  // Push AUTH_SUCCESS to the TV via WebSocket and create a room
  try {
    pending.hostWs.send(
      JSON.stringify({
        type: 'AUTH_SUCCESS',
        payload: {
          sessionToken: rawToken,
          hostId: host.id,
          displayName: host.displayName,
        },
      }),
    );

    // Create room for the authenticated host
    const room = createRoom(host.id);
    const wsData = pending.hostWs.data as WSData;
    wsData.roomCode = room.roomCode;
    room.setHost(pending.hostWs);

    // Generate invitation token for the game QR and store in DB
    const inviteToken = generateSecureToken(16);
    await invitationTokensRepo.create(db, hashToken(inviteToken), host.id, room.roomCode);

    pending.hostWs.send(
      JSON.stringify({
        type: 'ROOM_CREATED',
        payload: { roomCode: room.roomCode, invitationToken: inviteToken },
      }),
    );
  } catch {
    // TV WS may have disconnected
  }

  // Clean up the pending login
  removePendingLogin(pending.deviceCode);

  return c.json({ message: 'TV approved', host: { displayName: host.displayName } });
});

export { refreshTenancyFlag };
export default auth;
