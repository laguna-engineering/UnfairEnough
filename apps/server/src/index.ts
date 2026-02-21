import { readdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { Hono } from 'hono';
import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import { cors } from 'hono/cors';
import { initDatabase } from './db';
import { createRoom, destroyRoom, getRoom, setDbAdapter } from './roomManager';
import eventsRoutes from './routes/events';
import gamesRoutes from './routes/games';
import metaSetsRoutes from './routes/metaSets';
import playersRoutes from './routes/players';
import questionSetsRoutes from './routes/questionSets';
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

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (c) => {
  const mobilePort = mobileDevPort ? Number(mobileDevPort) : port;
  const mobilePath = mobileDevPort ? '' : '/mobile';
  const mobileBaseUrl = localIp ? `http://${localIp}:${mobilePort}${mobilePath}` : null;
  return c.json({ status: 'ok', lanIp: localIp ?? null, port, mobileBaseUrl });
});

// ── REST API routes ───────────────────────────────────────────
app.route('/api/question-sets', questionSetsRoutes);
app.route('/api/meta-sets', metaSetsRoutes);
app.route('/api/players', playersRoutes);
app.route('/api/games', gamesRoutes);
app.route('/api/tags', tagsRoutes);
app.route('/api/events', eventsRoutes);

// ── WebSocket endpoint ─────────────────────────────────────────
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    const role = c.req.query('role') as 'host' | 'player' | undefined;
    const roomCode = c.req.query('roomCode')?.toUpperCase();

    // Prepare ws data that Bun attaches to the connection
    const wsData: WSData = {
      roomCode: '',
      role: role ?? 'player',
      playerId: '',
    };

    return {
      onOpen(_event, ws) {
        const raw = ws.raw!;

        if (role === 'host') {
          // Host creates a new room
          const room = createRoom();
          wsData.roomCode = room.roomCode;
          raw.data = { ...raw.data, roomCode: room.roomCode, role: 'host' };
          room.setHost(raw);
          raw.send(JSON.stringify({ type: 'ROOM_CREATED', payload: { roomCode: room.roomCode } }));
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
          // Player sends JOIN message separately (standard protocol)
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
        const room = getRoom(data.roomCode);
        if (!room) return;

        if (data.role === 'host') {
          room.handleHostMessage(raw, event.data as string);
        } else {
          room.handlePlayerMessage(raw, event.data as string);
        }
      },

      onClose(_event, ws) {
        const raw = ws.raw!;
        const data = raw.data as WSData;
        const room = getRoom(data.roomCode);
        if (!room) return;

        if (data.role === 'host') {
          room.removeHost();
        } else if (data.playerId) {
          // Network drop — start grace period instead of immediate removal
          room.handlePlayerDisconnect(data.playerId);
        }

        // Only destroy room if truly empty (no players at all, not just disconnected)
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
