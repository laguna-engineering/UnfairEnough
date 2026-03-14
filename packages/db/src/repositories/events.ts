import type { DbAdapter, SqlValue } from '../adapter';
import { hostScope } from '../utils';

export type EventType =
  | 'QUESTION_SENT'
  | 'ANSWER_RECEIVED'
  | 'ANSWER_VALIDATED'
  | 'PHASE_CHANGE'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'GAME_STARTED'
  | 'GAME_ENDED';

export interface EventRow {
  id: number;
  game_id: string | null;
  room_code: string | null;
  event_type: string;
  player_id: string | null;
  host_id: string | null;
  data: string | null;
  created_at: string;
}

export async function logEvent(
  db: DbAdapter,
  event: {
    gameId?: string | null;
    roomCode?: string;
    eventType: EventType;
    playerId?: string | null;
    hostId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO events (game_id, room_code, event_type, player_id, host_id, data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.gameId ?? null,
      event.roomCode ?? null,
      event.eventType,
      event.playerId ?? null,
      event.hostId ?? null,
      event.data ? JSON.stringify(event.data) : null,
    ],
  );
}

export async function getEvents(
  db: DbAdapter,
  opts?: {
    gameId?: string;
    eventType?: EventType;
    hostId?: string | null;
    limit?: number;
  },
): Promise<EventRow[]> {
  const conditions: string[] = [];
  const params: SqlValue[] = [];

  if (opts?.gameId) {
    conditions.push('game_id = ?');
    params.push(opts.gameId);
  }
  if (opts?.eventType) {
    conditions.push('event_type = ?');
    params.push(opts.eventType);
  }
  if (opts?.hostId !== undefined) {
    const { clause, params: scopeParams } = hostScope(opts.hostId);
    conditions.push(clause);
    params.push(...scopeParams);
  }

  let sql = 'SELECT * FROM events';
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY id DESC';

  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }

  return db.all<EventRow>(sql, params);
}

export async function getRecentEvents(
  db: DbAdapter,
  hostId: string | null,
  limit = 100,
): Promise<EventRow[]> {
  const { clause, params } = hostScope(hostId);
  return db.all<EventRow>(`SELECT * FROM events WHERE ${clause} ORDER BY id DESC LIMIT ?`, [
    ...params,
    limit,
  ]);
}
