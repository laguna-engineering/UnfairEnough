/**
 * Hosted Game Controller
 * Connects to a Bun server as a host client via WebSocket.
 * Maps incoming ServerMessages to Redux dispatches.
 */

import {
  addPlayer,
  createStore,
  endGame,
  nextQuestion,
  type RootState,
  receiveAnswer,
  removePlayer,
  resetGame,
  resetScores,
  setCountdown,
  setPlayerConnected,
  setServerReady,
  showMediaPreview,
  showQuestion,
  showRoundResults,
  startGameCountdown,
  startRevealing,
  updateConfig,
  updateScore,
} from '@unfairenough/game-logic';
import type { ServerMessage } from '@unfairenough/ws-protocol';
import type { IGameController } from './IGameController';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const PING_INTERVAL = 30000;

export class HostedGameController implements IGameController {
  private store = createStore();
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private onRoomCreated?: (roomCode: string) => void;
  private onConnectionStateChange?: (state: ConnectionState) => void;

  constructor(
    serverUrl: string,
    callbacks?: {
      onRoomCreated?: (roomCode: string) => void;
      onConnectionStateChange?: (state: ConnectionState) => void;
    },
  ) {
    this.serverUrl = serverUrl;
    this.onRoomCreated = callbacks?.onRoomCreated;
    this.onConnectionStateChange = callbacks?.onConnectionStateChange;
  }

  async initialize(): Promise<void> {
    this.connect();
  }

  getState(): RootState {
    return this.store.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  startGame(): void {
    this.send({ type: 'START_GAME' });
  }

  reset(): void {
    this.send({ type: 'RESET_GAME' });
    this.store.dispatch(resetGame());
    this.store.dispatch(resetScores());
  }

  configureGame(gameType: 'casual' | 'configured', questionSetId?: string): void {
    this.send({ type: 'CONFIGURE_GAME', payload: { gameType, questionSetId } });
  }

  setLanguage(language: string): void {
    this.send({ type: 'SET_LANGUAGE', payload: { language } });
  }

  notifyMediaLoaded(): void {
    this.send({ type: 'MEDIA_LOADED' });
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopPingInterval();
    this.ws?.close();
    this.ws = null;
    this.setConnectionState('disconnected');
  }

  // ── Private ────────────────────────────────────────────────────

  private connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    )
      return;

    this.setConnectionState('connecting');

    // Normalize: strip protocol, ensure ws://
    const host = this.serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    const url = `ws://${host}/ws?role=host`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setConnectionState('connected');
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.setConnectionState('disconnected');
        this.stopPingInterval();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('HostedGameController WS error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.setConnectionState('disconnected');
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(data) as ServerMessage;
    } catch {
      console.error('Failed to parse server message:', data);
      return;
    }

    switch (message.type) {
      case 'ROOM_CREATED': {
        const { roomCode } = message.payload;
        this.store.dispatch(setServerReady({ port: 0, localIp: this.serverUrl, roomCode }));
        this.onRoomCreated?.(roomCode);
        break;
      }

      case 'PLAYER_JOINED': {
        const { playerId, name, color, emoji } = message.payload;
        this.store.dispatch(
          addPlayer({ id: playerId, name, color, emoji, score: 0, isConnected: true }),
        );
        break;
      }

      case 'PLAYER_LEFT':
        this.store.dispatch(removePlayer(message.payload.playerId));
        break;

      case 'PLAYER_DISCONNECTED':
        this.store.dispatch(
          setPlayerConnected({ id: message.payload.playerId, isConnected: false }),
        );
        break;

      case 'PLAYER_RECONNECTED':
        this.store.dispatch(
          setPlayerConnected({ id: message.payload.playerId, isConnected: true }),
        );
        break;

      case 'GAME_STARTING': {
        const currentPhase = this.store.getState().game.phase;
        if (currentPhase !== 'COUNTDOWN') {
          this.store.dispatch(startGameCountdown());
        }
        this.store.dispatch(setCountdown(message.payload.countdown));
        break;
      }

      case 'MEDIA_PREVIEW':
        if (this.store.getState().game.phase === 'RESULTS') {
          this.store.dispatch(nextQuestion());
        }
        this.store.dispatch(showMediaPreview(message.payload));
        break;

      case 'QUESTION':
        if (this.store.getState().game.phase === 'RESULTS') {
          this.store.dispatch(nextQuestion());
        }
        this.store.dispatch(showQuestion(message.payload));
        break;

      case 'TICK':
        this.store.dispatch(setCountdown(message.payload.remaining));
        break;

      case 'PLAYER_ANSWERED': {
        const { playerId: answeredId, questionId: answeredQId } = message.payload;
        const currentQ = this.store.getState().game.currentQuestion;
        if (currentQ?.id === answeredQId) {
          this.store.dispatch(
            receiveAnswer({ playerId: answeredId, answer: 'A', serverReceivedAt: Date.now() }),
          );
        }
        break;
      }

      case 'REVEALING':
        this.store.dispatch(startRevealing());
        break;

      case 'ROUND_END': {
        const { playerResults, rankings, tags, correctAnswer } = message.payload;
        // Update each player's score
        for (const pr of playerResults) {
          this.store.dispatch(updateScore({ id: pr.playerId, score: pr.totalScore }));
        }
        this.store.dispatch(
          showRoundResults({
            results: playerResults,
            rankings: rankings ?? [],
            correctAnswer,
            tags,
          }),
        );
        break;
      }

      case 'GAME_OVER':
        this.store.dispatch(endGame());
        break;

      case 'GAME_CONFIGURED':
        this.store.dispatch(
          updateConfig({
            gameType: message.payload.gameType as 'casual' | 'configured',
            questionSetId: message.payload.questionSetId,
            totalQuestions: message.payload.questionCount,
          }),
        );
        break;

      case 'ERROR':
        console.error('Server error:', message.payload.code, message.payload.message);
        break;

      case 'PONG':
        break;
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
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

  private scheduleReconnect(): void {
    if (this.reconnectTimeout || !this.serverUrl) return;

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.onConnectionStateChange?.(state);
  }
}
