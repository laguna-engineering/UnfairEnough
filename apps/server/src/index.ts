import { networkInterfaces } from 'node:os';
import { invitationTokensRepo, sessionsRepo } from '@unfairenough/db';
import { debugLog, setDebugEnabled } from '@unfairenough/shared';
import type { ServerWebSocket } from 'bun';
import { Hono } from 'hono';
import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import { cors } from 'hono/cors';
import { createAuthMiddleware } from './auth/middleware';
import { createPendingLogin, removePendingLoginByWs } from './auth/pendingLogins';
import { hashToken } from './auth/tokens';
import { getDb, initDatabase } from './db';
import { MAX_BUNDLE_SIZE } from './media/mediaStore';
import { resolveGuestSession } from './room';
import { createRoom, destroyRoom, findRoomByHostId, getRoom, setDbAdapter } from './roomManager';
import authRoutes from './routes/auth';
import bundleUploadRoutes from './routes/bundleUpload';
import eventsRoutes from './routes/events';
import gamesRoutes from './routes/games';
import mediaUploadRoutes from './routes/mediaUpload';
import metaSetsRoutes from './routes/metaSets';
import playersRoutes from './routes/players';
import questionSetsRoutes from './routes/questionSets';
import questionsRoutes from './routes/questions';
import tagsRoutes from './routes/tags';
import type { WSData } from './types';

// Debug logging: on in dev (non-production), or anywhere with UE_DEBUG=1.
setDebugEnabled(process.env.UE_DEBUG === '1' || process.env.NODE_ENV !== 'production');

const app = new Hono();

const port = Number(process.env.PORT) || 3000;
const mobileDevPort = process.env.MOBILE_DEV_PORT;
const localIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address;

// ── CORS (allow local dev origins) ──────────────────────────────
app.use('/api/*', cors());

// ── Health check (public — before auth middleware) ──────────────
app.get('/api/health', (c) => {
  const mobilePort = mobileDevPort ? Number(mobileDevPort) : port;
  const mobilePath = mobileDevPort ? '' : '/mobile';
  // Prefer the public base URL (SERVER_BASE_URL, set when behind a proxy) over the LAN IP.
  const base = process.env.SERVER_BASE_URL ?? (localIp ? `http://${localIp}:${mobilePort}` : null);
  const mobileBaseUrl = base ? `${base}${mobilePath}` : null;
  return c.json({ status: 'ok', lanIp: localIp ?? null, port, mobileBaseUrl });
});

// ── Auth middleware (scoped when tenancy enabled) ───────────────
// Uses getDb() lazily — DB is initialized before any requests arrive
const { scopedAuth } = createAuthMiddleware(getDb);
app.use('/api/*', scopedAuth);

// ── Auth routes (no middleware — public) ──────────────────────
app.route('/auth', authRoutes);

// ── REST API routes (scoped auth when tenancy enabled) ────────
// Bundle route registered before the /api/question-sets mount so it isn't
// shadowed by that router's path matching.
app.route('/api/question-sets/bundle', bundleUploadRoutes);
app.route('/api/question-sets', questionSetsRoutes);
app.route('/api/media', mediaUploadRoutes);
app.route('/api/meta-sets', metaSetsRoutes);
app.route('/api/players', playersRoutes);
app.route('/api/games', gamesRoutes);
app.route('/api/tags', tagsRoutes);
app.route('/api/questions', questionsRoutes);
app.route('/api/events', eventsRoutes);

// ── WebSocket endpoint ─────────────────────────────────────────

// Track host WSs that are awaiting auth (device flow, no room yet)
const awaitingAuthHosts = new Set<ServerWebSocket<WSData>>();

// Track host WSs that are pending session-token validation (async)
const pendingTokenValidation = new Set<ServerWebSocket<WSData>>();

// Server base URL for QR codes. Use SERVER_BASE_URL env var if behind a proxy.
const serverBaseUrl = process.env.SERVER_BASE_URL ?? `http://${localIp ?? 'localhost'}:${port}`;

// Idle timeout for host WS connections that haven't sent any message
const HOST_IDLE_TIMEOUT_MS = 30_000;

function summarizeWsMessage(data: string | Buffer): {
  type: string;
  bytes: number;
  parseError?: true;
} {
  const text = data.toString();
  try {
    const parsed = JSON.parse(text) as { type?: unknown };
    return { type: typeof parsed.type === 'string' ? parsed.type : 'UNKNOWN', bytes: text.length };
  } catch {
    return { type: 'INVALID_JSON', bytes: text.length, parseError: true };
  }
}

/** Create a room for an authenticated host and send ROOM_CREATED */
function createRoomForHost(
  hostWs: ServerWebSocket<WSData>,
  hostId: string | null,
  invitationToken?: string,
): void {
  const room = createRoom(hostId);
  debugLog('[ws] room created for host', { roomCode: room.roomCode, hostId });
  const data = hostWs.data as WSData;
  data.roomCode = room.roomCode;
  room.setHost(hostWs);
  const payload: { roomCode: string; invitationToken?: string } = { roomCode: room.roomCode };
  if (invitationToken) payload.invitationToken = invitationToken;
  hostWs.send(JSON.stringify({ type: 'ROOM_CREATED', payload }));
}

/** Resolve room for a player that connected with roomCode=AUTO (returning user). */
async function resolveAutoRoom(raw: ServerWebSocket<WSData>, rawMessage: string): Promise<void> {
  const data = raw.data as WSData;
  try {
    const msg = JSON.parse(rawMessage);
    if (msg.type === 'IDENTIFY' && msg.payload?.sessionToken) {
      // Try in-memory guest session lookup first
      const guestSession = resolveGuestSession(msg.payload.sessionToken);
      if (guestSession) {
        const room = getRoom(guestSession.roomCode);
        if (room) {
          data.roomCode = guestSession.roomCode;
          room.handlePlayerMessage(raw, rawMessage);
          return;
        }
      }

      // Fall back to DB session lookup: find hostId, then find host's active room
      const db = getDb();
      const tokenHash = hashToken(msg.payload.sessionToken);
      const session = await sessionsRepo.validate(db, tokenHash);
      if (session) {
        const room = findRoomByHostId(session.hostId);
        if (room) {
          data.roomCode = room.roomCode;
          room.handlePlayerMessage(raw, rawMessage);
          return;
        }
      }

      // No room found for this session
      raw.send(
        JSON.stringify({
          type: 'ERROR',
          payload: { code: 'ROOM_NOT_FOUND', message: 'No active room found for this session' },
        }),
      );
      raw.close();
      return;
    }
    if (msg.type === 'PING') {
      raw.send(JSON.stringify({ type: 'PONG' }));
      return;
    }
  } catch {
    // Parse error
  }

  // Non-IDENTIFY message with no room — reject
  raw.send(
    JSON.stringify({
      type: 'ERROR',
      payload: { code: 'NO_ROOM', message: 'Send IDENTIFY with sessionToken to resolve room' },
    }),
  );
  raw.close();
}

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    const role = c.req.query('role') as 'host' | 'player' | undefined;
    const roomCode = c.req.query('roomCode')?.toUpperCase();
    const sessionToken = c.req.query('token');

    const proto = c.req.url.startsWith('https') ? 'https' : 'http';
    const wsBaseUrl = `${proto}://${c.req.header('host') || 'localhost'}`;

    const wsData: WSData = {
      roomCode: '',
      role: role ?? 'player',
      playerId: '',
      serverBaseUrl: wsBaseUrl,
    };

    return {
      onOpen(_event, ws) {
        const raw = ws.raw!;
        debugLog('[ws] open', { role, roomCode });

        if (role === 'host') {
          raw.data = { ...raw.data, roomCode: '', role: 'host' };

          if (sessionToken) {
            // Pre-authenticated host: validate session token and create room immediately
            pendingTokenValidation.add(raw);
            const tokenHash = hashToken(sessionToken);
            void sessionsRepo.validate(getDb(), tokenHash).then((session) => {
              pendingTokenValidation.delete(raw);
              // Check WS is still open (may have disconnected during async validation)
              if (raw.readyState !== 1) return;

              if (session) {
                createRoomForHost(raw, session.hostId);
              } else {
                raw.send(
                  JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'SESSION_INVALID',
                      message: 'Session token is invalid or expired',
                    },
                  }),
                );
                raw.close();
              }
            });
          } else {
            // No session token — wait for device-flow auth or legacy mode
            // Room is created when:
            // a) Host sends REQUEST_AUTH → device flow → approved → room created
            // b) Host sends any other message (legacy mode) → room created immediately
            awaitingAuthHosts.add(raw);
            // Close idle host connections that never send a message
            const idleTimer = setTimeout(() => {
              if (!(raw.data as WSData).roomCode) {
                try {
                  raw.close();
                } catch {
                  /* already closed */
                }
              }
            }, HOST_IDLE_TIMEOUT_MS);
            (raw.data as any)._idleTimer = idleTimer;
          }
        } else if (role === 'player' && roomCode === 'AUTO') {
          // Returning user: room will be resolved when IDENTIFY arrives with sessionToken.
          // Keep the connection open in a "pending resolution" state (empty roomCode).
          raw.data = { ...raw.data, roomCode: '', role: 'player' };
        } else if (role === 'player' && roomCode) {
          const room = getRoom(roomCode);
          debugLog('[ws] player open', { roomCode, found: !!room });
          if (!room) {
            raw.send(
              JSON.stringify({
                type: 'ERROR',
                payload: { code: 'ROOM_NOT_FOUND', message: 'Room not found' },
              }),
            );
            raw.close();
            return;
          }
          wsData.roomCode = roomCode;
          raw.data = { ...raw.data, roomCode, role: 'player' };
        } else {
          raw.send(
            JSON.stringify({
              type: 'ERROR',
              payload: {
                code: 'INVALID_PARAMS',
                message: 'Use ?role=host or ?role=player&roomCode=XXXX',
              },
            }),
          );
          raw.close();
        }
      },

      onMessage(event, ws) {
        const raw = ws.raw!;
        const data = raw.data as WSData;
        const rawMessage = event.data as string | Buffer;
        const messageSummary = summarizeWsMessage(rawMessage);
        if (messageSummary.type !== 'PING') {
          debugLog('[ws] message', {
            role: data.role,
            roomCode: data.roomCode,
            playerId: data.playerId || undefined,
            ...messageSummary,
          });
        }

        if (data.role === 'host') {
          // If host has no room yet (awaiting auth or legacy)
          if (!data.roomCode) {
            // Clear idle timer — host sent a message
            if ((data as any)._idleTimer) {
              clearTimeout((data as any)._idleTimer);
              (data as any)._idleTimer = null;
            }

            try {
              const msg = JSON.parse(rawMessage.toString());
              if (msg.type === 'REQUEST_AUTH') {
                // Device flow: create pending login, send challenge
                const pending = createPendingLogin(raw);
                if (!pending) {
                  raw.send(
                    JSON.stringify({
                      type: 'AUTH_FAILED',
                      payload: { reason: 'Too many pending logins. Try again later.' },
                    }),
                  );
                  return;
                }
                raw.send(
                  JSON.stringify({
                    type: 'AUTH_CHALLENGE',
                    payload: {
                      userCode: pending.userCode,
                      verificationUrl: `${serverBaseUrl}/auth/tv-login?code=${pending.userCode}`,
                      expiresIn: pending.expiresIn,
                    },
                  }),
                );
                awaitingAuthHosts.delete(raw);
                return;
              }
              if (msg.type === 'PING') {
                raw.send(JSON.stringify({ type: 'PONG' }));
                return;
              }
            } catch {
              // Parse error — treat as legacy
            }

            // If token validation is in progress, ignore non-PING messages
            if (pendingTokenValidation.has(raw)) return;

            // Legacy mode: first non-auth message → create room immediately
            awaitingAuthHosts.delete(raw);
            createRoomForHost(raw, null);
            // Fall through to handle the message in the room
          }

          const room = getRoom(data.roomCode);
          if (room) {
            room.handleHostMessage(raw, rawMessage);
          }
        } else {
          // Player with no room yet (roomCode=AUTO): resolve room from session token
          if (!data.roomCode) {
            void resolveAutoRoom(raw, rawMessage.toString());
            return;
          }

          const room = getRoom(data.roomCode);
          if (room) {
            room.handlePlayerMessage(raw, rawMessage);
          }
        }
      },

      onClose(event, ws) {
        const raw = ws.raw!;
        const data = raw.data as WSData;
        debugLog('[ws] close', {
          role: data.role,
          roomCode: data.roomCode,
          code: (event as { code?: number })?.code,
          reason: (event as { reason?: string })?.reason,
        });

        // Clean up pending login / token validation / idle timer if host disconnects before auth
        awaitingAuthHosts.delete(raw);
        pendingTokenValidation.delete(raw);
        if ((data as any)._idleTimer) {
          clearTimeout((data as any)._idleTimer);
        }
        removePendingLoginByWs(raw);

        const room = getRoom(data.roomCode);
        if (!room) return;

        if (data.role === 'host') {
          room.removeHost();
        } else if (data.playerId) {
          room.handlePlayerDisconnect(data.playerId);
        }

        if (room.isEmpty) {
          debugLog('[ws] destroying empty room', data.roomCode);
          destroyRoom(data.roomCode);
        }
      },
    };
  }),
);

// ── Question media (images) ─────────────────────────────────
app.use('/media/*', serveStatic({ root: '../../questions/' }));

// ── Admin dashboard ──────────────────────────────────────────
app.get('/admin', (c) => c.redirect('/admin/'));
app.use('/admin/*', async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});
app.use('/admin/*', serveStatic({ root: './' }));

// ── TV host web build ────────────────────────────────────────
const tvStaticDir = process.env.TV_STATIC_DIR ?? './public';
app.get('/tv', (c) => c.redirect('/tv/'));
app.use(
  '/tv/*',
  serveStatic({
    root: tvStaticDir,
    rewriteRequestPath: (p) => p.replace(/^\/tv/, ''),
  }),
);

// ── Mobile web app ───────────────────────────────────────────

async function proxyToMetro(req: Request, path: string) {
  try {
    const url = new URL(path, `http://localhost:${mobileDevPort}`);
    url.search = new URL(req.url).search;

    const resp = await fetch(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    });

    const headers = new Headers(resp.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  } catch {
    return new Response(
      '<html><body style="font-family:system-ui;padding:2rem"><h1>Mobile dev server not available</h1><p>Start it with <code>yarn dev:mobile</code></p></body></html>',
      { status: 502, headers: { 'Content-Type': 'text/html' } },
    );
  }
}

if (mobileDevPort) {
  // Dev mode: proxy to Expo Metro dev server
  app.get('/mobile', (c) => c.redirect('/mobile/'));
  app.all('/mobile/*', async (c) => {
    const path = c.req.path.replace(/^\/mobile/, '') || '/';
    return proxyToMetro(c.req.raw, path);
  });

  // Catch-all: also proxy to Metro for absolute-path assets (JS bundles, etc.)
  app.get('/', (c) => c.redirect('/mobile/'));
  app.all('/*', async (c) => proxyToMetro(c.req.raw, c.req.path));
} else {
  // Production: serve static mobile build
  const mobileStaticDir = process.env.MOBILE_STATIC_DIR ?? './public-mobile';
  app.get('/mobile', (c) => c.redirect('/mobile/'));
  app.use(
    '/mobile/*',
    serveStatic({
      root: mobileStaticDir,
      rewriteRequestPath: (p) => p.replace(/^\/mobile/, ''),
    }),
  );

  app.get('/', (c) => c.redirect('/mobile/'));
}

// ── Initialize database and start server ──────────────────────
const db = await initDatabase();
setDbAdapter(db);

// Clean up expired invitation tokens periodically (every hour)
setInterval(
  async () => {
    try {
      await invitationTokensRepo.cleanup(db);
    } catch {
      /* ignore cleanup errors */
    }
  },
  60 * 60 * 1000,
);

export default {
  port,
  fetch: app.fetch,
  websocket,
  // Allow question-set bundles up to the handler's ceiling (default is 128 MB,
  // which would abort large bundle uploads before the handler's size check runs).
  maxRequestBodySize: MAX_BUNDLE_SIZE,
};

console.log(`Server listening on http://localhost:${port}`);
if (localIp) {
  console.log(`  LAN: http://${localIp}:${port}`);
}
console.log(`  /mobile/  → ${mobileDevPort ? `proxy to Metro :${mobileDevPort}` : 'static build'}`);
console.log(`  /tv/      → static from ${tvStaticDir}`);
console.log('  /admin/   → admin dashboard');
