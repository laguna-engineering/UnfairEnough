/**
 * WebSocket Server Service
 * Uses react-native-tcp-socket to run a real WebSocket server
 */

import type { Question, ServerMessage } from '@unfairenough/ws-protocol';
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';

const PORT = 8080;
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
type PlayerJoinedCallback = (data: { playerId: string; name: string; color: string }) => void;
type PlayerLeftCallback = (data: { playerId: string }) => void;
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
  onAnswerReceived?: AnswerReceivedCallback;
}

interface Client {
  socket: TcpSocket.Socket;
  playerId: string | null;
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
          this.callbacks.onPlayerLeft?.({ playerId: client.playerId });
          this.broadcast({ type: 'PLAYER_LEFT', payload: { playerId: client.playerId } });
        }
      });

      socket.on('error', () => {
        this.clients.delete(client);
      });
    });

    this.server.listen({ port: PORT, host: '0.0.0.0' }, async () => {
      this.localIp = await this.getLocalIp();
      console.log(`WebSocket server listening on ${this.localIp}:${PORT}`);

      this.callbacks.onServerReady?.({
        port: PORT,
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
      // On emulator, use localhost (requires: adb forward tcp:8080 tcp:8080)
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
          const playerData = { playerId, name: message.payload.name, color };

          client.playerId = playerId;

          this.sendToClient(client, {
            type: 'WELCOME',
            payload: { ...playerData, language: this.language },
          });
          this.callbacks.onPlayerJoined?.(playerData);
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

  stop(): void {
    for (const client of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }
}

export const wsServer = new WebSocketServerService();
