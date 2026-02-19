import type { ServerWebSocket } from 'bun';

// Re-export HostMessage from the shared protocol package
export type { HostMessage } from '@unfairenough/ws-protocol';

/** Data attached to each Bun WebSocket connection */
export interface WSData {
  roomCode: string;
  role: 'host' | 'player';
  playerId: string;
}

/** Internal player record within a game room */
export interface RoomPlayer {
  playerId: string;
  name: string;
  color: string;
  score: number;
  ws: ServerWebSocket<WSData> | null;
  deviceId?: string;
  profileId?: string;
  isConnected: boolean;
  disconnectTimer?: Timer;
}
