import { type DbAdapter, invitationTokensRepo } from '@unfairenough/db';
import { generateRoomCode } from '@unfairenough/ws-protocol';
import { GameRoom } from './room';

const rooms = new Map<string, GameRoom>();

let dbAdapter: DbAdapter;

export function setDbAdapter(db: DbAdapter): void {
  dbAdapter = db;
}

export function createRoom(hostId: string | null = null, invitationToken?: string): GameRoom {
  if (!dbAdapter) throw new Error('DB adapter not set. Call setDbAdapter() first.');

  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = new GameRoom(code, dbAdapter, hostId, invitationToken);
  rooms.set(code, room);
  console.log('[room] create', code, '— total rooms:', rooms.size);
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

/** Find the active room hosted by the given hostId. Returns the first match. */
export function findRoomByHostId(hostId: string): GameRoom | undefined {
  for (const room of rooms.values()) {
    if (room.hostId === hostId) return room;
  }
  return undefined;
}

export function destroyRoom(code: string): void {
  const room = rooms.get(code);
  if (room) {
    console.log('[room] destroy', code, '— remaining:', rooms.size - 1);
    room.cleanup();
    invitationTokensRepo.removeByRoom(dbAdapter, code);
    rooms.delete(code);
  }
}
