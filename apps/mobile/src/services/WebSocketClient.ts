/**
 * WebSocket Client Service
 * Handles connection to the TV host WebSocket server
 */

import { debugLog } from '@unfairenough/shared';
import type {
  AnswerKey,
  ClientMessage,
  GameResult,
  IdentityPayload,
  MediaPreviewPayload,
  Question,
  RoundResult,
  ServerMessage,
  WelcomePayload,
} from '@unfairenough/ws-protocol';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface Callbacks {
  onConnectionStateChange?: (state: ConnectionState) => void;
  onIdentity?: (data: IdentityPayload) => void;
  onWelcome?: (data: WelcomePayload) => void;
  onPlayerJoined?: (data: { playerId: string; name: string; color: string }) => void;
  onPlayerLeft?: (data: { playerId: string }) => void;
  onPlayerDisconnected?: (data: { playerId: string }) => void;
  onPlayerReconnected?: (data: { playerId: string }) => void;
  onGameStarting?: (countdown: number) => void;
  onMediaPreview?: (data: MediaPreviewPayload) => void;
  onQuestion?: (question: Question & { serverTimestamp: number }) => void;
  onTick?: (remaining: number) => void;
  onAnswerAck?: (questionId: string, serverReceivedAt: number) => void;
  onRoundEnd?: (result: RoundResult) => void;
  onGameOver?: (result: GameResult) => void;
  onError?: (error: { code: string; message: string }) => void;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const PING_INTERVAL = 30000;
// Errors that won't resolve by retrying — stop reconnecting so the UI can recover.
const FATAL_ERROR_CODES = new Set(['ROOM_NOT_FOUND', 'INVALID_PARAMS', 'SESSION_INVALID']);

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private callbacks: Callbacks = {};
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private playerId: string | null = null;
  private pendingDeviceId: string | null = null;
  private pendingSessionToken: string | null = null;
  private pendingInvitationToken: string | null = null;
  private connectionState: ConnectionState = 'disconnected';

  setCallbacks(callbacks: Callbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  connect(url: string, deviceId?: string, sessionToken?: string, invitationToken?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      debugLog('[ws-client] connect ignored; socket already open', {
        currentUrl: this.url,
        requestedUrl: url,
      });
      return;
    }

    this.url = url;
    this.pendingDeviceId = deviceId ?? null;
    this.pendingSessionToken = sessionToken ?? null;
    this.pendingInvitationToken = invitationToken ?? null;
    debugLog('[ws-client] connect', {
      url,
      hasDeviceId: !!deviceId,
      hasSessionToken: !!sessionToken,
      hasInvitationToken: !!invitationToken,
      hasExistingPlayerId: !!this.playerId,
    });
    this.setConnectionState('connecting');

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        debugLog('[ws-client] open', {
          url: this.url,
          hasPlayerId: !!this.playerId,
          hasPendingDeviceId: !!this.pendingDeviceId,
          hasSessionToken: !!this.pendingSessionToken,
          hasInvitationToken: !!this.pendingInvitationToken,
        });
        this.reconnectAttempt = 0;
        this.setConnectionState('connected');
        this.startPingInterval();

        // If we have a stored playerId, try to reconnect
        if (this.playerId) {
          this.send({ type: 'RECONNECT', payload: { playerId: this.playerId } });
        } else if (this.pendingDeviceId) {
          // New connection — identify the device to check for an existing profile
          this.send({
            type: 'IDENTIFY',
            payload: {
              deviceId: this.pendingDeviceId,
              sessionToken: this.pendingSessionToken ?? undefined,
              invitationToken: this.pendingInvitationToken ?? undefined,
            },
          });
          this.pendingDeviceId = null;
          this.pendingSessionToken = null;
          this.pendingInvitationToken = null;
        } else {
          debugLog('[ws-client] open without playerId or deviceId; no handshake sent');
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        debugLog('[ws-client] close', {
          code: (event as { code?: number })?.code,
          reason: (event as { reason?: string })?.reason,
          url: this.url,
        });
        this.setConnectionState('disconnected');
        this.stopPingInterval();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        debugLog('[ws-client] error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.setConnectionState('disconnected');
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ServerMessage;
      debugLog('[ws-client] msg', message.type);

      switch (message.type) {
        case 'IDENTITY':
          this.callbacks.onIdentity?.(message.payload);
          break;

        case 'WELCOME':
          this.playerId = message.payload.playerId;
          this.callbacks.onWelcome?.(message.payload);
          break;

        case 'PLAYER_JOINED':
          this.callbacks.onPlayerJoined?.(message.payload);
          break;

        case 'PLAYER_LEFT':
          this.callbacks.onPlayerLeft?.(message.payload);
          break;

        case 'PLAYER_DISCONNECTED':
          this.callbacks.onPlayerDisconnected?.(message.payload);
          break;

        case 'PLAYER_RECONNECTED':
          this.callbacks.onPlayerReconnected?.(message.payload);
          break;

        case 'GAME_STARTING':
          this.callbacks.onGameStarting?.(message.payload.countdown);
          break;

        case 'MEDIA_PREVIEW':
          this.callbacks.onMediaPreview?.(message.payload);
          break;

        case 'QUESTION':
          this.callbacks.onQuestion?.(message.payload);
          break;

        case 'TICK':
          this.callbacks.onTick?.(message.payload.remaining);
          break;

        case 'ANSWER_ACK':
          this.callbacks.onAnswerAck?.(
            message.payload.questionId,
            message.payload.serverReceivedAt,
          );
          break;

        case 'ROUND_END':
          this.callbacks.onRoundEnd?.(message.payload);
          break;

        case 'GAME_OVER':
          this.callbacks.onGameOver?.(message.payload);
          break;

        case 'ERROR':
          // If session expired, clear playerId so client re-joins fresh
          if (message.payload.code === 'SESSION_EXPIRED') {
            this.playerId = null;
          }
          // Fatal errors won't fix themselves on retry — stop the reconnect loop
          // so the UI can surface the error instead of spinning forever.
          if (FATAL_ERROR_CODES.has(message.payload.code)) {
            this.stopReconnecting();
          }
          this.callbacks.onError?.(message.payload);
          break;

        case 'PONG':
          // Ping acknowledged
          break;
      }
    } catch (error) {
      debugLog('[ws-client] failed to parse message', { error, data });
    }
  }

  private describeClientMessage(message: ClientMessage): Record<string, unknown> {
    switch (message.type) {
      case 'IDENTIFY':
        return {
          type: message.type,
          hasDeviceId: !!message.payload.deviceId,
          hasSessionToken: !!message.payload.sessionToken,
          hasInvitationToken: !!message.payload.invitationToken,
        };
      case 'JOIN':
        return {
          type: message.type,
          nameLength: message.payload.name.length,
          hasRoomCode: !!message.payload.roomCode,
          hasDeviceId: !!message.payload.deviceId,
          hasProfileId: !!message.payload.profileId,
        };
      case 'RECONNECT':
        return { type: message.type, playerId: message.payload.playerId };
      case 'ANSWER':
        return {
          type: message.type,
          questionId: message.payload.questionId,
          answer: message.payload.answer,
        };
      case 'UNBIND':
        return { type: message.type, hasDeviceId: !!message.payload.deviceId };
      case 'LEAVE':
      case 'PING':
        return { type: message.type };
    }
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      debugLog('[ws-client] send', this.describeClientMessage(message));
      this.ws.send(JSON.stringify(message));
      return;
    }

    debugLog('[ws-client] drop send; socket is not open', {
      message: this.describeClientMessage(message),
      readyState: this.ws?.readyState ?? null,
    });
  }

  identify(deviceId: string, sessionToken?: string, invitationToken?: string): void {
    this.send({ type: 'IDENTIFY', payload: { deviceId, sessionToken, invitationToken } });
  }

  join(name: string, roomCode?: string, deviceId?: string, profileId?: string): void {
    this.send({ type: 'JOIN', payload: { name, roomCode, deviceId, profileId } });
  }

  unbind(deviceId: string): void {
    this.send({ type: 'UNBIND', payload: { deviceId } });
  }

  sendAnswer(questionId: string, answer: AnswerKey): void {
    this.send({ type: 'ANSWER', payload: { questionId, answer } });
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING' });
    }, PING_INTERVAL);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /** Cancel any pending reconnect and stop retrying the current URL. */
  private stopReconnecting(): void {
    debugLog('[ws-client] stopReconnecting (fatal error)');
    this.url = null;
    this.reconnectAttempt = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout || !this.url) return;

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    debugLog('[ws-client] scheduleReconnect attempt', this.reconnectAttempt, 'in', delay, 'ms');
    this.reconnectAttempt++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.url) {
        this.connect(this.url);
      }
    }, delay);
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.callbacks.onConnectionStateChange?.(state);
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopPingInterval();
    // Send LEAVE so the server skips the grace period
    this.send({ type: 'LEAVE' });
    this.url = null;
    this.pendingDeviceId = null;
    this.pendingSessionToken = null;
    this.pendingInvitationToken = null;
    this.reconnectAttempt = 0;
    this.playerId = null;
    this.ws?.close();
    this.ws = null;
    this.setConnectionState('disconnected');
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
