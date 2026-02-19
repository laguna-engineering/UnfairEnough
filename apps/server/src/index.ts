import { networkInterfaces } from 'node:os';
import { Hono } from 'hono';
import { serveStatic, upgradeWebSocket, websocket } from 'hono/bun';
import { initDatabase } from './db';
import { createRoom, destroyRoom, getRoom, setDbAdapter } from './roomManager';
import gamesRoutes from './routes/games';
import playersRoutes from './routes/players';
import questionSetsRoutes from './routes/questionSets';
import tagsRoutes from './routes/tags';
import type { WSData } from './types';

const app = new Hono();

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// ── REST API routes ───────────────────────────────────────────
app.route('/api/question-sets', questionSetsRoutes);
app.route('/api/players', playersRoutes);
app.route('/api/games', gamesRoutes);
app.route('/api/tags', tagsRoutes);

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

// ── Static files (TV host web build) ──────────────────────────
const staticDir = process.env.STATIC_DIR ?? './public';
app.use('/*', serveStatic({ root: staticDir }));

// ── Initialize database and start server ──────────────────────
const port = Number(process.env.PORT) || 3000;

const db = await initDatabase();
setDbAdapter(db);

export default {
  port,
  fetch: app.fetch,
  websocket,
};

const localIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address;

console.log(`Server listening on http://localhost:${port}`);
if (localIp) {
  console.log(`  LAN: http://${localIp}:${port}`);
}
