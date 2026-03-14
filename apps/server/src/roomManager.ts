import type { DbAdapter } from '@unfairenough/db';
import { generateRoomCode } from '@unfairenough/ws-protocol';
import { GameRoom } from './room';

const rooms = new Map<string, GameRoom>();

let dbAdapter: DbAdapter;

export function setDbAdapter(db: DbAdapter): void {
  dbAdapter = db;
}

export function createRoom(hostId: string | null = null): GameRoom {
  if (!dbAdapter) throw new Error('DB adapter not set. Call setDbAdapter() first.');

  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = new GameRoom(code, dbAdapter, hostId);
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

export function destroyRoom(code: string): void {
  const room = rooms.get(code);
  if (room) {
    room.cleanup();
    rooms.delete(code);
  }
}

/** Check if a host already has an active room. Returns the room code if so. */
export function findRoomByHostId(hostId: string): string | null {
  for (const [code, room] of rooms) {
    if (room.hostId === hostId) return code;
  }
  return null;
}
