/**
 * WebSocket Server Service
 * Uses react-native-tcp-socket to run a real WebSocket server
 */

import type { Question, ServerMessage } from '@unfairenough/ws-protocol';
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';

const COLORS = [
  '#FF6B9D',
  '#4ECDC4',
  '#FFE66D',
  '#95E1D3',
  '#F38181',
  '#AA96DA',
  '#FCBAD3',
  '#A8D8EA',
  '#FF9F43',
  '#6C5CE7',
  '#00B894',
  '#FD79A8',
];
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

type ServerReadyCallback = (data: { port: number; localIp: string; roomCode: string }) => void;
type PlayerJoinedCallback = (data: {
  playerId: string;
  name: string;
  color: string;
  deviceId?: string;
}) => void;
type PlayerLeftCallback = (data: { playerId: string }) => void;
type PlayerDisconnectedCallback = (data: { playerId: string }) => void;
type PlayerReconnectedCallback = (data: { playerId: string }) => void;
type AnswerReceivedCallback = (data: {
  playerId: string;
  questionId: string;
  answer: 'A' | 'B' | 'C' | 'D';
  serverReceivedAt: number;
}) => void;

interface Callbacks {
  onServerReady?: ServerReadyCallback;
  onPlayerJoined?: PlayerJoinedCallback;
  onPlayerLeft?: PlayerLeftCallback;
  onPlayerDisconnected?: PlayerDisconnectedCallback;
  onPlayerReconnected?: PlayerReconnectedCallback;
  onAnswerReceived?: AnswerReceivedCallback;
}

interface GraveyardEntry {
  playerId: string;
  name: string;
  color: string;
  timer: ReturnType<typeof setTimeout>;
}

interface Client {
  socket: TcpSocket.Socket;
  playerId: string | null;
  playerName: string;
  playerColor: string;
  buffer: Buffer;
  upgraded: boolean;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createWebSocketAcceptKey(key: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, key + WS_GUID, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return hash;
}

function parseWebSocketFrame(
  buffer: Buffer,
): { opcode: number; payload: string; totalLength: number } | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const isMasked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let maskKey: Buffer | null = null;
  if (isMasked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) return null;

  const payload = Buffer.from(buffer.slice(offset, offset + payloadLength));
  if (isMasked && maskKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return { opcode, payload: payload.toString('utf8'), totalLength: offset + payloadLength };
}

function createWebSocketFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf8');
  const length = payload.length;

  let header: Buffer;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

class WebSocketServerService {
  private callbacks: Callbacks = {};
  private server: TcpSocket.Server | null = null;
  private clients: Set<Client> = new Set();
  private graveyard = new Map<string, GraveyardEntry>();
  private colorIndex = 0;
  private roomCode: string = '';
  private localIp: string = '';
  private language: string = 'en';

  async start(): Promise<void> {
    if (this.server) return;

    this.roomCode = generateRoomCode();

    this.server = TcpSocket.createServer((socket) => {
      const client: Client = {
        socket,
        playerId: null,
        playerName: '',
        playerColor: '',
        buffer: Buffer.alloc(0),
        upgraded: false,
      };
      this.clients.add(client);

      socket.on('data', (data: Buffer | string) => {
        const chunk = typeof data === 'string' ? Buffer.from(data) : data;
        client.buffer = Buffer.concat([client.buffer, chunk]);

        if (!client.upgraded) {
          this.handleHttpUpgrade(client);
        } else {
          this.handleWebSocketData(client);
        }
      });

      socket.on('close', () => {
        this.clients.delete(client);
        if (client.playerId) {
          this.startGracePeriod(client.playerId, client.playerName, client.playerColor);
        }
      });

      socket.on('error', () => {
        this.clients.delete(client);
        if (client.playerId) {
          this.startGracePeriod(client.playerId, client.playerName, client.playerColor);
        }
      });
    });

    this.server.listen({ port: 0, host: '0.0.0.0' }, async () => {
      const assignedPort = this.server.address()?.port;
      if (!assignedPort) {
        console.error('Failed to get assigned port');
        return;
      }
      this.localIp = await this.getLocalIp();
      console.log(`WebSocket server listening on ${this.localIp}:${assignedPort}`);

      this.callbacks.onServerReady?.({
        port: assignedPort,
        localIp: this.localIp,
        roomCode: this.roomCode,
      });
    });
  }

  private async getLocalIp(): Promise<string> {
    try {
      const ip = await Network.getIpAddressAsync();
      // expo-network may return 0.0.0.0 on emulators
      if (ip && ip !== '0.0.0.0' && ip !== '127.0.0.1') {
        return ip;
      }
      // On emulator, use localhost (requires adb forward for the assigned port)
      console.log('No valid IP found, using localhost (emulator mode)');
      return 'localhost';
    } catch (error) {
      console.log('getLocalIp error:', error);
      return 'localhost';
    }
  }

  private async handleHttpUpgrade(client: Client): Promise<void> {
    const request = client.buffer.toString('utf8');
    if (!request.includes('\r\n\r\n')) return;

    const keyMatch = request.match(/Sec-WebSocket-Key: (.+)\r\n/);
    if (!keyMatch) {
      client.socket.destroy();
      return;
    }

    const acceptKey = await createWebSocketAcceptKey(keyMatch[1].trim());
    const response = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    client.socket.write(response);
    client.upgraded = true;
    client.buffer = Buffer.alloc(0);
  }

  private handleWebSocketData(client: Client): void {
    let frame: ReturnType<typeof parseWebSocketFrame> = null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard parser loop pattern
    while ((frame = parseWebSocketFrame(client.buffer)) !== null) {
      client.buffer = client.buffer.slice(frame.totalLength);

      if (frame.opcode === 0x08) {
        client.socket.destroy();
        return;
      }

      if (frame.opcode === 0x01) {
        this.handleMessage(client, frame.payload);
      }
    }
  }

  private handleMessage(client: Client, data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'JOIN': {
          const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const color = COLORS[this.colorIndex++ % COLORS.length];
          const deviceId: string | undefined = message.payload.deviceId;
          const playerData = { playerId, name: message.payload.name, color };

          client.playerId = playerId;
          client.playerName = message.payload.name;
          client.playerColor = color;

          this.sendToClient(client, {
            type: 'WELCOME',
            payload: { ...playerData, language: this.language },
          });
          this.callbacks.onPlayerJoined?.({ ...playerData, deviceId });
          this.broadcast({ type: 'PLAYER_JOINED', payload: playerData });
          break;
        }

        case 'ANSWER': {
          if (client.playerId) {
            const serverReceivedAt = Date.now();
            this.sendToClient(client, {
              type: 'ANSWER_ACK',
              payload: { questionId: message.payload.questionId, serverReceivedAt },
            });
            this.callbacks.onAnswerReceived?.({
              playerId: client.playerId,
              questionId: message.payload.questionId,
              answer: message.payload.answer,
              serverReceivedAt,
            });
          }
          break;
        }

        case 'RECONNECT': {
          const entry = this.graveyard.get(message.payload.playerId);
          if (!entry) {
            this.sendToClient(client, {
              type: 'ERROR',
              payload: { code: 'SESSION_EXPIRED', message: 'Session expired. Please rejoin.' },
            });
            break;
          }

          // Restore the player
          clearTimeout(entry.timer);
          this.graveyard.delete(entry.playerId);
          client.playerId = entry.playerId;

          // Re-send WELCOME
          this.sendToClient(client, {
            type: 'WELCOME',
            payload: {
              playerId: entry.playerId,
              playerColor: entry.color,
              roomCode: this.roomCode,
              language: this.language,
            },
          });

          this.callbacks.onPlayerReconnected?.({ playerId: entry.playerId });
          this.broadcast({
            type: 'PLAYER_RECONNECTED',
            payload: { playerId: entry.playerId },
          });
          break;
        }

        case 'LEAVE': {
          if (client.playerId) {
            const playerId = client.playerId;
            // Remove from graveyard if somehow there
            const entry = this.graveyard.get(playerId);
            if (entry) {
              clearTimeout(entry.timer);
              this.graveyard.delete(playerId);
            }
            client.playerId = null;
            this.callbacks.onPlayerLeft?.({ playerId });
            this.broadcast({ type: 'PLAYER_LEFT', payload: { playerId } });
          }
          break;
        }

        case 'PING':
          this.sendToClient(client, { type: 'PONG' });
          break;
      }
    } catch (error) {
      console.error('Message parse error:', error);
    }
  }

  private sendToClient(client: Client, message: ServerMessage): void {
    if (client.upgraded) {
      client.socket.write(createWebSocketFrame(JSON.stringify(message)));
    }
  }

  broadcast(message: ServerMessage): void {
    const frame = createWebSocketFrame(JSON.stringify(message));
    for (const client of this.clients) {
      if (client.upgraded) {
        client.socket.write(frame);
      }
    }
  }

  sendQuestion(question: Question): void {
    const serverTimestamp = Date.now();
    this.broadcast({ type: 'QUESTION', payload: { ...question, serverTimestamp } });
  }

  sendTick(remaining: number): void {
    this.broadcast({ type: 'TICK', payload: { remaining } });
  }

  sendGameStarting(countdown: number): void {
    this.broadcast({ type: 'GAME_STARTING', payload: { countdown } });
  }

  setCallbacks(callbacks: Callbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  /** Move a disconnected player to the graveyard with a 30s grace period. */
  private startGracePeriod(playerId: string, name: string, color: string): void {
    // If already in graveyard, skip (avoid duplicate timers)
    if (this.graveyard.has(playerId)) return;

    const timer = setTimeout(() => {
      this.graveyard.delete(playerId);
      this.callbacks.onPlayerLeft?.({ playerId });
      this.broadcast({ type: 'PLAYER_LEFT', payload: { playerId } });
    }, 30_000);

    this.graveyard.set(playerId, { playerId, name, color, timer });

    this.callbacks.onPlayerDisconnected?.({ playerId });
    this.broadcast({ type: 'PLAYER_DISCONNECTED', payload: { playerId } });
  }

  stop(): void {
    for (const client of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();
    for (const entry of this.graveyard.values()) {
      clearTimeout(entry.timer);
    }
    this.graveyard.clear();
    this.server?.close();
    this.server = null;
  }
}

export const wsServer = new WebSocketServerService();
