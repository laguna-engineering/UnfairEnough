import { generateRoomCode } from '@unfairenough/ws-protocol';
import { GameRoom } from './room';
import type { DbAdapter } from '@unfairenough/db';

const rooms = new Map<string, GameRoom>();

let dbAdapter: DbAdapter;

export function setDbAdapter(db: DbAdapter): void {
  dbAdapter = db;
}

export function createRoom(): GameRoom {
  if (!dbAdapter) throw new Error('DB adapter not set. Call setDbAdapter() first.');

  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = new GameRoom(code, dbAdapter);
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
