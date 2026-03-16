import { readdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { invitationTokensRepo } from '@unfairenough/db';
import type { ServerWebSocket } from 'bun';
import { Hono } from 'hono';
import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import { cors } from 'hono/cors';
import { createAuthMiddleware } from './auth/middleware';
import { createPendingLogin, removePendingLoginByWs } from './auth/pendingLogins';
import { getDb, initDatabase } from './db';
import { createRoom, destroyRoom, getRoom, setDbAdapter } from './roomManager';
import authRoutes from './routes/auth';
import eventsRoutes from './routes/events';
import gamesRoutes from './routes/games';
import metaSetsRoutes from './routes/metaSets';
import playersRoutes from './routes/players';
import questionSetsRoutes from './routes/questionSets';
import questionsRoutes from './routes/questions';
import tagsRoutes from './routes/tags';
import type { WSData } from './types';

const app = new Hono();

const port = Number(process.env.PORT) || 3000;
const mobileDevPort = process.env.MOBILE_DEV_PORT;
const localIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address;

// ── CORS (allow local dev origins) ──────────────────────────────
app.use('/api/*', cors());

// ── Auth middleware (scoped when tenancy enabled) ───────────────
// Uses getDb() lazily — DB is initialized before any requests arrive
const { scopedAuth } = createAuthMiddleware(getDb);
app.use('/api/*', scopedAuth);

// ── Auth routes (no middleware — public) ──────────────────────
app.route('/auth', authRoutes);

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (c) => {
  const mobilePort = mobileDevPort ? Number(mobileDevPort) : port;
  const mobilePath = mobileDevPort ? '' : '/mobile';
  const mobileBaseUrl = localIp ? `http://${localIp}:${mobilePort}${mobilePath}` : null;
  return c.json({ status: 'ok', lanIp: localIp ?? null, port, mobileBaseUrl });
});

// ── REST API routes (scoped auth when tenancy enabled) ────────
app.route('/api/question-sets', questionSetsRoutes);
app.route('/api/meta-sets', metaSetsRoutes);
app.route('/api/players', playersRoutes);
app.route('/api/games', gamesRoutes);
app.route('/api/tags', tagsRoutes);
app.route('/api/questions', questionsRoutes);
app.route('/api/events', eventsRoutes);

// ── WebSocket endpoint ─────────────────────────────────────────

// Track host WSs that are awaiting auth (device flow, no room yet)
const awaitingAuthHosts = new Set<ServerWebSocket<WSData>>();

/** Create a room for an authenticated host and send ROOM_CREATED */
function createRoomForHost(
  hostWs: ServerWebSocket<WSData>,
  hostId: string | null,
  invitationToken?: string,
): void {
  const room = createRoom(hostId);
  const data = hostWs.data as WSData;
  data.roomCode = room.roomCode;
  room.setHost(hostWs);
  const payload: { roomCode: string; invitationToken?: string } = { roomCode: room.roomCode };
  if (invitationToken) payload.invitationToken = invitationToken;
  hostWs.send(JSON.stringify({ type: 'ROOM_CREATED', payload }));
}

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    const role = c.req.query('role') as 'host' | 'player' | undefined;
    const roomCode = c.req.query('roomCode')?.toUpperCase();

    const proto = c.req.url.startsWith('https') ? 'https' : 'http';
    const serverBaseUrl = `${proto}://${c.req.header('host') || 'localhost'}`;

    const wsData: WSData = {
      roomCode: '',
      role: role ?? 'player',
      playerId: '',
      serverBaseUrl,
    };

    return {
      onOpen(_event, ws) {
        const raw = ws.raw!;

        if (role === 'host') {
          // Don't create room yet — host may need to authenticate first (device flow).
          // Room is created when:
          // a) Host sends REQUEST_AUTH → device flow → approved → room created
          // b) Host sends any other message (legacy mode) → room created immediately
          raw.data = { ...raw.data, roomCode: '', role: 'host' };
          awaitingAuthHosts.add(raw);
        } else if (role === 'player' && roomCode) {
          const room = getRoom(roomCode);
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

        if (data.role === 'host') {
          // If host has no room yet (awaiting auth or legacy)
          if (!data.roomCode) {
            try {
              const msg = JSON.parse(event.data as string);
              if (msg.type === 'REQUEST_AUTH') {
                // Device flow: create pending login, send challenge
                const pending = createPendingLogin(raw);
                const serverUrl = `${c.req.url.startsWith('https') ? 'https' : 'http'}://${c.req.header('host')}`;
                raw.send(
                  JSON.stringify({
                    type: 'AUTH_CHALLENGE',
                    payload: {
                      userCode: pending.userCode,
                      verificationUrl: `${serverUrl}/auth/tv-login?code=${pending.userCode}`,
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

            // Legacy mode: first non-auth message → create room immediately
            awaitingAuthHosts.delete(raw);
            createRoomForHost(raw, null);
            // Fall through to handle the message in the room
          }

          const room = getRoom(data.roomCode);
          if (room) {
            room.handleHostMessage(raw, event.data as string);
          }
        } else {
          const room = getRoom(data.roomCode);
          if (room) {
            room.handlePlayerMessage(raw, event.data as string);
          }
        }
      },

      onClose(_event, ws) {
        const raw = ws.raw!;
        const data = raw.data as WSData;

        // Clean up pending login if host disconnects before auth
        awaitingAuthHosts.delete(raw);
        removePendingLoginByWs(raw);

        const room = getRoom(data.roomCode);
        if (!room) return;

        if (data.role === 'host') {
          room.removeHost();
        } else if (data.playerId) {
          room.handlePlayerDisconnect(data.playerId);
        }

        if (room.isEmpty) {
          destroyRoom(data.roomCode);
        }
      },
    };
  }),
);

// ── Background music ─────────────────────────────────────────
const musicDir = './music';

app.get('/api/music', async (c) => {
  try {
    const entries = await readdir(musicDir);
    const tracks = entries.filter((f) => f.toLowerCase().endsWith('.mp3')).sort();
    return c.json({ tracks });
  } catch {
    return c.json({ tracks: [] });
  }
});

app.use('/music/*', serveStatic({ root: './' }));

// ── Question media (images) ─────────────────────────────────
app.use('/media/*', serveStatic({ root: '../../questions/' }));

// ── Admin dashboard ──────────────────────────────────────────
app.get('/admin', (c) => c.redirect('/admin/'));
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
};

console.log(`Server listening on http://localhost:${port}`);
if (localIp) {
  console.log(`  LAN: http://${localIp}:${port}`);
}
console.log(`  /mobile/  → ${mobileDevPort ? `proxy to Metro :${mobileDevPort}` : 'static build'}`);
console.log(`  /tv/      → static from ${tvStaticDir}`);
console.log('  /admin/   → admin dashboard');
