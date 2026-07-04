import type { DbAdapter, QuestionWithMeta } from '@unfairenough/db';
import {
  eventsRepo,
  gamesRepo,
  invitationTokensRepo,
  playersRepo,
  playerTagScoresRepo,
  questionsRepo,
  sessionsRepo,
} from '@unfairenough/db';
import { debugLog } from '@unfairenough/shared';
import type {
  AnswerKey,
  ClientMessage,
  IdentityPayload,
  MediaPreviewPayload,
  PlayerRanking,
  PlayerResult,
  PositionSnapshot,
  Question,
  RoundResult,
  ServerMessage,
  StateSnapshotPayload,
  WelcomePayload,
} from '@unfairenough/ws-protocol';
import { generatePlayerId, parseClientMessage } from '@unfairenough/ws-protocol';
import type { ServerWebSocket } from 'bun';
import {
  buildQuestionPool,
  filterOverusedPictureYears,
  filterRecentlyServedQuestions,
  limitPicturesPerAnswerYear,
  selectNextQuestion,
} from '../../../packages/game-logic/src/utils/questionSelection';
import {
  calculateScore,
  computeLifetimeHandicap,
  computeSpeedBonusMultiplier,
  computeTimeBonusMultiplier,
  rankPlayers,
} from '../../../packages/game-logic/src/utils/scoring';
import {
  computeEffectiveDifficulty,
  computePlayerDifficulty,
  computeTagUpdates,
  decayedScore,
  difficultyMultiplier,
  ELO_BASELINE,
  resolvePlayerDifficulty,
} from '../../../packages/game-logic/src/utils/tagScoring';
import { generateSecureToken, hashToken, sqliteDateFromNow } from './auth/tokens';
import type { HostMessage, RoomPlayer, WSData } from './types';

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

const DEFAULT_QUESTION_TIME_LIMIT = 15;
const MAX_PLAYERS = 12;

const TOTAL_QUESTIONS = 10;
const COUNTDOWN_SECONDS = 3;
const REVEAL_DELAY_MS = 2000;
const RESULTS_DELAY_MS = 5000;
const MEDIA_LOAD_TIMEOUT_MS = 10_000;
// Backstop for the between-questions "hold until the next media is warm" gate:
// if the host never acks the preload, advance anyway so a slow/dead host can't
// wedge the game (the at-preview MEDIA_LOADED handshake is the secondary net).
const PRELOAD_HOLD_TIMEOUT_MS = 5000;

// How many recently-served question IDs a room remembers across consecutive games
// so the next game's selection can avoid repeating them. filterRecentlyServed()
// relaxes this whenever a set pool is too small to fill a game without reuse, so a
// generous window is safe.
const RECENT_QUESTION_MEMORY = 500;
const GUEST_SESSION_TTL_DAYS = 90;

type GamePhase =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'MEDIA_PREVIEW'
  | 'QUESTION'
  | 'REVEALING'
  | 'RESULTS'
  | 'GAME_OVER';

interface PlayerAnswer {
  answer: AnswerKey;
  serverReceivedAt: number;
}

/** In-memory guest session: maps token hash → { hostId, roomCode } */
const guestSessions = new Map<string, { hostId: string; roomCode: string }>();

/** Look up a guest session by raw token. Returns hostId + roomCode if valid. */
export function resolveGuestSession(rawToken: string): { hostId: string; roomCode: string } | null {
  const hash = hashToken(rawToken);
  return guestSessions.get(hash) ?? null;
}

export class GameRoom {
  readonly roomCode: string;
  readonly hostId: string | null;
  private readonly db: DbAdapter;
  private readonly invitationToken: string | undefined;

  private phase: GamePhase = 'LOBBY';
  private players = new Map<string, RoomPlayer>();
  private hostWs: ServerWebSocket<WSData> | null = null;
  private colorIndex = 0;
  private language = 'en';

  // Game state
  private questions: QuestionWithMeta[] = [];
  private questionPool: QuestionWithMeta[] = [];
  private usedQuestionIds = new Set<string>();
  // Question IDs served in this room's recent games, oldest→newest. Unlike
  // usedQuestionIds (within-game, cleared each game), this persists across games
  // for the room's lifetime so back-to-back games don't repeat questions. It is
  // deliberately NOT cleared in reset().
  private recentlyServedQuestionIds: string[] = [];
  private currentQuestionIndex = 0;
  private activeQuestion: QuestionWithMeta | null = null;
  private questionStartTime = 0;
  private answers = new Map<string, PlayerAnswer>();
  private positionHistory: PositionSnapshot[] = [];
  private gameId: string | null = null;
  private lastRoundResult: RoundResult | null = null;
  private countdownRemaining = 0;

  // Tag-based personalization state
  private playerTagScores = new Map<string, Map<string, number>>();
  private currentRoundDifficulties = new Map<string, number>();

  // Game configuration
  private gameType: 'casual' | 'configured' | 'custom' = 'casual';
  private questionSetId: string | null = null;
  private questionSetIds: string[] = [];
  private adaptiveMode = false;
  private isMetaSet = false;
  private configuredTotalQuestions: number | null = null;
  private configuredTimeLimit: number | null = null;

  // Serialization — prevent startGame from racing with configureGame
  private configurePromise: Promise<void> | null = null;

  // Timers
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private questionTimer: ReturnType<typeof setInterval> | null = null;
  private revealTimeout: ReturnType<typeof setTimeout> | null = null;
  private resultsTimeout: ReturnType<typeof setTimeout> | null = null;
  private mediaLoadWaitTimeout: ReturnType<typeof setTimeout> | null = null;
  private mediaPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

  // Media load tracking — wait for host TV to signal image loaded
  private waitingForMediaLoad = false;
  private pendingMediaQuestion: QuestionWithMeta | null = null;
  private pendingPreviewDuration = 0;
  private mediaPreviewEndsAt = 0;

  // One-question lookahead (KTD2/3/4) — the next question's media the host is
  // warming, its ack, and the between-questions hold that waits for it.
  private preloadQuestionId: string | null = null;
  private preloadAcked = false;
  private awaitingPreloadAdvance = false;
  private preloadHoldTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    roomCode: string,
    db: DbAdapter,
    hostId: string | null = null,
    invitationToken?: string,
  ) {
    this.roomCode = roomCode;
    this.db = db;
    this.hostId = hostId;
    this.invitationToken = invitationToken;
  }

  // ── Host management ──────────────────────────────────────────

  setHost(ws: ServerWebSocket<WSData>): void {
    this.hostWs = ws;
  }

  removeHost(): void {
    this.hostWs = null;
  }

  // ── Player management ────────────────────────────────────────

  async addPlayer(
    ws: ServerWebSocket<WSData>,
    name: string,
    deviceId?: string,
    claimProfileId?: string,
  ): Promise<string | null> {
    debugLog('[room] addPlayer request', {
      roomCode: this.roomCode,
      nameLength: name.length,
      hasDeviceId: !!deviceId,
      hasClaimProfileId: !!claimProfileId,
      phase: this.phase,
      playerCount: this.players.size,
    });

    if (this.players.size >= MAX_PLAYERS) {
      this.sendTo(ws, {
        type: 'ERROR',
        payload: { code: 'ROOM_FULL', message: 'Room is full' },
      });
      return null;
    }

    if (this.phase !== 'LOBBY') {
      this.sendTo(ws, {
        type: 'ERROR',
        payload: { code: 'GAME_IN_PROGRESS', message: 'Game already in progress' },
      });
      return null;
    }

    const playerId = generatePlayerId();

    // Look up or create player profile
    let profileId: string | undefined;
    let playerName = name;
    let playerColor: string | undefined;
    let playerEmoji: string | undefined;
    let lifetimeScore = 0;

    if (claimProfileId && deviceId) {
      // Claiming a pre-created profile
      try {
        const claimed = await playersRepo.claimProfile(
          this.db,
          claimProfileId,
          deviceId,
          this.hostId,
        );
        if (!claimed) {
          this.sendTo(ws, {
            type: 'ERROR',
            payload: { code: 'PROFILE_ALREADY_CLAIMED', message: 'Profile was already claimed' },
          });
          return null;
        }
        const profile = await playersRepo.getPlayer(this.db, claimProfileId);
        if (profile) {
          profileId = profile.id;
          playerName = profile.displayName;
          playerColor = profile.avatarColor;
          playerEmoji = profile.avatarEmoji ?? undefined;
          lifetimeScore = profile.totalScore;
          await playersRepo.updateLastSeen(this.db, profile.id);
        }
      } catch (err) {
        console.error('Profile claim failed:', err);
      }
    } else if (deviceId) {
      try {
        const existingProfile = await playersRepo.findByDeviceId(this.db, deviceId, this.hostId);
        if (existingProfile) {
          profileId = existingProfile.id;
          playerColor = existingProfile.avatarColor;
          playerEmoji = existingProfile.avatarEmoji ?? undefined;
          lifetimeScore = existingProfile.totalScore;
          // Update name if changed, and touch last_seen_at
          if (existingProfile.displayName !== name) {
            await playersRepo.updateDisplayName(this.db, existingProfile.id, name);
          } else {
            await playersRepo.updateLastSeen(this.db, existingProfile.id);
          }
        } else {
          // Create new auto-profile
          profileId = crypto.randomUUID();
          const autoColor = COLORS[this.colorIndex++ % COLORS.length];
          await playersRepo.createPlayer(
            this.db,
            profileId,
            name,
            autoColor,
            this.hostId,
            deviceId,
          );
          playerColor = autoColor;
        }
      } catch (err) {
        // Don't block joining if DB fails — play as anonymous
        console.error('Player profile lookup failed:', err);
      }
    }

    // Use profile color if available, otherwise assign from palette
    const color = playerColor ?? COLORS[this.colorIndex++ % COLORS.length];

    const welcomePayload: WelcomePayload = {
      playerId,
      playerColor: color,
      roomCode: this.roomCode,
      language: this.language,
    };

    if (profileId) {
      try {
        const profile = await playersRepo.getPlayer(this.db, profileId);
        if (profile) {
          welcomePayload.profile = {
            displayName: profile.displayName,
            totalGames: profile.totalGames,
            totalWins: profile.totalWins,
          };
        }
      } catch {
        // Non-critical — continue without profile in welcome
      }
    }

    this.players.set(playerId, {
      playerId,
      name: playerName,
      color,
      score: 0,
      ws,
      deviceId,
      profileId,
      lifetimeScore,
      isConnected: true,
    });

    // Update the ws data so we can identify this connection later
    ws.data.playerId = playerId;

    // Send WELCOME to the joining player
    this.sendTo(ws, { type: 'WELCOME', payload: welcomePayload });

    // Broadcast PLAYER_JOINED to everyone (including host)
    this.broadcast({
      type: 'PLAYER_JOINED',
      payload: { playerId, name: playerName, color, emoji: playerEmoji },
    });

    debugLog('[room] player joined', {
      roomCode: this.roomCode,
      playerId,
      hasProfileId: !!profileId,
      playerCount: this.players.size,
    });

    this.logEvent('PLAYER_JOINED', playerId, { name: playerName, profileId });

    return playerId;
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player?.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
    }
    this.players.delete(playerId);
    this.broadcast({ type: 'PLAYER_LEFT', payload: { playerId } });
  }

  /** Mark player as disconnected with a 30s grace period before full removal. */
  handlePlayerDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.ws = null;
    player.isConnected = false;

    this.broadcast({ type: 'PLAYER_DISCONNECTED', payload: { playerId } });

    // Start 30-second grace period
    player.disconnectTimer = setTimeout(() => {
      player.disconnectTimer = undefined;
      this.removePlayer(playerId);
    }, 30_000);
  }

  /** Intentional leave — skip grace period, remove immediately. */
  handlePlayerLeave(playerId: string): void {
    this.removePlayer(playerId);
  }

  get playerCount(): number {
    return this.players.size;
  }

  get hasHost(): boolean {
    return this.hostWs !== null;
  }

  get isEmpty(): boolean {
    return this.players.size === 0 && this.hostWs === null;
  }

  private get connectedPlayerCount(): number {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.isConnected) count++;
    }
    return count;
  }

  // ── Message handling ─────────────────────────────────────────

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
          hasDeviceId: !!message.payload.deviceId,
          hasProfileId: !!message.payload.profileId,
          hasRoomCode: !!message.payload.roomCode,
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

  handlePlayerMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer): void {
    let message: ClientMessage;
    try {
      message = parseClientMessage(raw.toString());
    } catch (err) {
      debugLog('[room] invalid player message', {
        roomCode: this.roomCode,
        playerId: ws.data.playerId || undefined,
        error: err instanceof Error ? err.message : String(err),
      });
      this.sendTo(ws, {
        type: 'ERROR',
        payload: { code: 'INVALID_MESSAGE', message: 'Invalid message format' },
      });
      return;
    }

    if (message.type !== 'PING') {
      debugLog('[room] player message', {
        roomCode: this.roomCode,
        playerId: ws.data.playerId || undefined,
        ...this.describeClientMessage(message),
      });
    }

    switch (message.type) {
      case 'IDENTIFY': {
        this.handleIdentify(
          ws,
          message.payload.deviceId,
          message.payload.sessionToken,
          message.payload.invitationToken,
        );
        break;
      }
      case 'JOIN': {
        this.addPlayer(
          ws,
          message.payload.name,
          message.payload.deviceId,
          message.payload.profileId,
        );
        break;
      }
      case 'UNBIND': {
        this.handleUnbind(ws, message.payload.deviceId);
        break;
      }
      case 'ANSWER': {
        this.handleAnswer(ws, message.payload.questionId, message.payload.answer);
        break;
      }
      case 'PING': {
        this.sendTo(ws, { type: 'PONG' });
        break;
      }
      case 'RECONNECT': {
        const { playerId } = message.payload;
        const player = this.players.get(playerId);

        if (!player) {
          this.sendTo(ws, {
            type: 'ERROR',
            payload: { code: 'SESSION_EXPIRED', message: 'Session expired. Please rejoin.' },
          });
          return;
        }

        // Clear the removal timer
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = undefined;
        }

        // Swap the WebSocket
        player.ws = ws;
        player.isConnected = true;
        ws.data.playerId = playerId;

        // Send current game state to the reconnected player
        this.sendGameStateToPlayer(player);

        // Notify everyone
        this.broadcast({ type: 'PLAYER_RECONNECTED', payload: { playerId } });
        break;
      }
      case 'LEAVE': {
        const playerId = ws.data.playerId;
        if (playerId) {
          this.handlePlayerLeave(playerId);
        }
        break;
      }
    }
  }

  handleHostMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer): void {
    let message: HostMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
      case 'PING':
        // Keep-alive: a roomed host pings every 30s; answer so the round-trip
        // stays bidirectional (the pre-room path in index.ts does the same).
        this.sendTo(ws, { type: 'PONG' });
        break;
      case 'START_GAME':
        this.startGame();
        break;
      case 'RESET_GAME':
        this.reset();
        break;
      case 'SET_LANGUAGE':
        if (message.payload?.language) {
          this.language = message.payload.language;
        }
        break;
      case 'CONFIGURE_GAME':
        this.configurePromise = this.configureGame(message.payload);
        break;
      case 'MEDIA_LOADED':
        this.onMediaLoaded(message.payload?.success ?? true, message.payload?.questionId);
        break;
      case 'MEDIA_PRELOADED':
        this.onMediaPreloaded(message.payload.success, message.payload.questionId);
        break;
    }
  }

  // ── Reconnection state sync ─────────────────────────────────

  /** Send enough state for a reconnected player to catch up. */
  private sendGameStateToPlayer(player: RoomPlayer): void {
    if (!player.ws) return;

    // Re-send WELCOME so the client restores its identity (playerId/color/room).
    this.sendTo(player.ws, {
      type: 'WELCOME',
      payload: {
        playerId: player.playerId,
        playerColor: player.color,
        roomCode: this.roomCode,
        language: this.language,
      },
    });

    // Send a full snapshot of the current phase so the client renders it
    // directly instead of falling back to the lobby/waiting screen.
    this.sendTo(player.ws, {
      type: 'STATE_SNAPSHOT',
      payload: this.buildStateSnapshot(player),
    });
  }

  /** Assemble the current-phase snapshot for a (re)connecting player. */
  private buildStateSnapshot(player: RoomPlayer): StateSnapshotPayload {
    const phase = this.phase;
    switch (phase) {
      case 'COUNTDOWN':
        return { phase, countdown: Math.max(0, this.countdownRemaining) };

      case 'MEDIA_PREVIEW': {
        const q = this.getCurrentQuestion();
        const hasPreviewAudio = q?.audio?.play === 'preview';
        if (!q || (!q.media && !hasPreviewAudio)) return { phase };
        return {
          phase,
          mediaPreview: {
            questionId: q.id,
            questionNumber: this.currentQuestionIndex + 1,
            totalQuestions: this.totalQuestionCount,
            ...this.previewMediaFields(q),
            duration: this.getMediaPreviewRemainingSeconds(),
          },
        };
      }

      case 'QUESTION':
      case 'REVEALING': {
        const q = this.getCurrentQuestion();
        const answer = this.answers.get(player.playerId);
        return {
          phase,
          question: q ? this.buildQuestionPayload(q) : undefined,
          hasAnswered: !!answer,
          yourAnswer: answer?.answer,
        };
      }

      case 'RESULTS':
        return { phase, roundResult: this.lastRoundResult ?? undefined };

      case 'GAME_OVER': {
        const rankings = this.buildRankings();
        const winner = rankings[0] ?? { playerId: '', name: '', score: 0 };
        return {
          phase,
          gameResult: {
            rankings,
            winner: { playerId: winner.playerId, name: winner.name, score: winner.score },
            positionHistory: this.positionHistory,
          },
        };
      }

      default:
        return { phase: 'LOBBY' };
    }
  }

  /** Remaining media-preview display time, or the full duration before the TV has loaded it. */
  private getMediaPreviewRemainingSeconds(): number {
    if (this.mediaPreviewEndsAt > 0) {
      return Math.max(0, Math.ceil((this.mediaPreviewEndsAt - Date.now()) / 1000));
    }
    return Math.max(0, this.pendingPreviewDuration);
  }

  /** Build a QUESTION payload, with `timeLimit` set to the remaining time. */
  /**
   * The image + listen-first-audio fields shared by every MEDIA_PREVIEW payload
   * (live broadcast and reconnect snapshot). Image is optional; audio appears
   * only when the question is authored listen-first (play: preview).
   */
  private previewMediaFields(q: QuestionWithMeta): Pick<MediaPreviewPayload, 'media' | 'audio'> {
    return {
      media: q.media ? { type: q.media.type, url: q.media.url } : undefined,
      audio: q.audio && q.audio.play === 'preview' ? q.audio : undefined,
    };
  }

  private buildQuestionPayload(q: QuestionWithMeta): Question & { serverTimestamp: number } {
    const timeLimit = this.configuredTimeLimit ?? q.timeLimit ?? DEFAULT_QUESTION_TIME_LIMIT;
    const elapsed = Math.floor((Date.now() - this.questionStartTime) / 1000);
    const remaining = Math.max(0, timeLimit - elapsed);

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit: remaining,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.totalQuestionCount,
      serverTimestamp: this.questionStartTime,
      tags: !q.hideTags && q.tags.length > 0 ? q.tags : undefined,
      media: q.media
        ? { type: q.media.type, url: q.media.url, previewDuration: q.media.previewDuration }
        : undefined,
      audio: q.audio ?? undefined,
    };
  }

  // ── Game configuration ───────────────────────────────────────

  private async configureGame(
    payload: import('@unfairenough/ws-protocol').ConfigureGamePayload,
  ): Promise<void> {
    if (this.phase !== 'LOBBY') return;

    if (
      payload.gameType === 'custom' &&
      payload.questionSetIds &&
      payload.questionSetIds.length > 0
    ) {
      // Validate all set IDs exist, are non-meta, and have questions
      let totalAvailable = 0;
      for (const setId of payload.questionSetIds) {
        const set = await questionsRepo.getQuestionSet(this.db, setId);
        if (!set) {
          this.sendToHost({
            type: 'ERROR',
            payload: { code: 'SET_NOT_FOUND', message: `Question set not found: ${setId}` },
          });
          return;
        }
        if (set.isMeta) {
          this.sendToHost({
            type: 'ERROR',
            payload: {
              code: 'META_SET_NOT_ALLOWED',
              message: 'Meta sets cannot be used in custom mode',
            },
          });
          return;
        }
        totalAvailable += set.questionCount;
      }

      if (totalAvailable === 0) {
        this.sendToHost({
          type: 'ERROR',
          payload: { code: 'SET_EMPTY', message: 'Selected sets have no questions' },
        });
        return;
      }

      const requestedTotal = payload.totalQuestions ?? totalAvailable;
      const clampedTotal = Math.max(1, Math.min(requestedTotal, totalAvailable));
      const clampedTimeLimit = payload.questionTimeLimit
        ? Math.max(1, payload.questionTimeLimit)
        : null;

      this.gameType = 'custom';
      this.questionSetId = null;
      this.questionSetIds = payload.questionSetIds;
      this.adaptiveMode = payload.adaptiveMode ?? true;
      this.isMetaSet = false;
      this.configuredTotalQuestions = clampedTotal;
      this.configuredTimeLimit = clampedTimeLimit;

      this.sendToHost({
        type: 'GAME_CONFIGURED',
        payload: {
          gameType: 'custom',
          questionCount: clampedTotal,
          questionSetIds: payload.questionSetIds,
          adaptiveMode: this.adaptiveMode,
        },
      });
    } else if (payload.gameType === 'configured' && payload.questionSetId) {
      // Validate the set exists and has questions
      const set = await questionsRepo.getQuestionSet(this.db, payload.questionSetId);
      if (!set) {
        this.sendToHost({
          type: 'ERROR',
          payload: { code: 'SET_NOT_FOUND', message: 'Question set not found' },
        });
        return;
      }

      const questionCount = set.isMeta
        ? (await questionsRepo.getQuestionsByMetaSet(this.db, payload.questionSetId)).length
        : (await questionsRepo.getQuestionsBySet(this.db, payload.questionSetId)).length;

      if (questionCount === 0) {
        this.sendToHost({
          type: 'ERROR',
          payload: { code: 'SET_EMPTY', message: 'Question set has no questions' },
        });
        return;
      }

      this.gameType = 'configured';
      this.questionSetId = payload.questionSetId;
      this.questionSetIds = [];
      this.adaptiveMode = false;
      this.isMetaSet = set.isMeta;
      this.configuredTotalQuestions = payload.totalQuestions ?? null;
      this.configuredTimeLimit = payload.questionTimeLimit ?? null;

      this.sendToHost({
        type: 'GAME_CONFIGURED',
        payload: { gameType: 'configured', questionCount, questionSetId: payload.questionSetId },
      });
    } else {
      this.gameType = 'casual';
      this.questionSetId = null;
      this.questionSetIds = [];
      this.adaptiveMode = false;
      this.configuredTotalQuestions = payload.totalQuestions ?? null;
      this.configuredTimeLimit = payload.questionTimeLimit ?? null;

      this.sendToHost({
        type: 'GAME_CONFIGURED',
        payload: {
          gameType: 'casual',
          questionCount: this.configuredTotalQuestions ?? TOTAL_QUESTIONS,
        },
      });
    }
  }

  // ── Game flow ────────────────────────────────────────────────

  private async startGame(): Promise<void> {
    if (this.phase !== 'LOBBY') return;
    if (this.players.size === 0) return;

    // Wait for any pending configureGame to finish before reading game config
    if (this.configurePromise) {
      await this.configurePromise;
      this.configurePromise = null;
    }

    // Load tag scores early — needed for both pool building and per-round selection
    // Skip for casual games: no historical data used
    if (this.gameType === 'configured' || (this.gameType === 'custom' && this.adaptiveMode)) {
      await this.loadPlayerTagScores();
    }

    // Load questions based on game configuration
    if (this.gameType === 'custom' && this.questionSetIds.length > 0) {
      // Custom mode: load from multiple sets
      const fetched = await questionsRepo.getQuestionsBySetIds(this.db, this.questionSetIds);
      const requestedCount = this.configuredTotalQuestions ?? fetched.length;
      // Drop questions this room served in recent games so back-to-back games
      // don't repeat (relaxed automatically when the pool is too small).
      const rawPool = filterRecentlyServedQuestions(
        fetched,
        requestedCount,
        this.recentlyServedQuestionIds,
      );

      if (this.adaptiveMode) {
        // Adaptive: use selection pipeline
        this.questionPool = buildQuestionPool(rawPool, {
          nRounds: requestedCount,
          playerTagScores: this.playerTagScores,
        });
        this.questions = this.questionPool.slice(0, requestedCount);
      } else {
        // Non-adaptive: pick freshest questions, then shuffle for presentation order.
        // The DB returns questions ordered by freshness (never-asked first, then
        // least-recently-asked, with RANDOM() among ties), so slicing from the
        // front gives us the freshest subset. Cap same-year photos first so one
        // year can't dominate and turn later photos into giveaways.
        const selected = limitPicturesPerAnswerYear(rawPool).slice(0, requestedCount);
        for (let i = selected.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [selected[i], selected[j]] = [selected[j], selected[i]];
        }
        this.questions = selected;
        this.questionPool = [];
      }
    } else if (this.gameType === 'configured' && this.questionSetId && !this.isMetaSet) {
      // Regular configured set: serve in authored order
      this.questions = await questionsRepo.getQuestionsBySet(this.db, this.questionSetId);
      if (this.configuredTotalQuestions && this.configuredTotalQuestions < this.questions.length) {
        this.questions = this.questions.slice(0, this.configuredTotalQuestions);
      }
      this.questionPool = [];
    } else {
      // Casual mode or meta set: use adaptive selection pipeline
      const requestedCount = this.configuredTotalQuestions ?? TOTAL_QUESTIONS;
      let rawPool: QuestionWithMeta[];

      if (this.isMetaSet && this.questionSetId) {
        // Meta set: load freshest questions from child sets (ordered by last_asked_at)
        rawPool = await questionsRepo.getQuestionsByMetaSet(
          this.db,
          this.questionSetId,
          requestedCount * 3,
        );
      } else {
        // Casual mode: load 3× from the general pool
        rawPool = await questionsRepo.getRandomQuestions(
          this.db,
          requestedCount * 3,
          this.hostId,
          undefined,
          this.language,
        );
      }

      // Drop questions this room served in recent games (relaxed when the pool
      // is too small) so consecutive games don't repeat.
      rawPool = filterRecentlyServedQuestions(
        rawPool,
        requestedCount,
        this.recentlyServedQuestionIds,
      );

      if (this.gameType === 'casual') {
        // Casual: completely random (DB already orders by freshness + random)
        this.questionPool = rawPool;
      } else {
        // Meta set: use adaptive selection pipeline
        this.questionPool = buildQuestionPool(rawPool, {
          nRounds: requestedCount,
          playerTagScores: this.playerTagScores,
        });
      }
      this.questions = this.questionPool.slice(0, requestedCount);
    }
    if (this.questions.length === 0 && this.questionPool.length === 0) return;

    this.currentQuestionIndex = 0;
    this.positionHistory = [];
    this.usedQuestionIds.clear();

    // Create game session in DB (non-casual games)
    if (this.gameType !== 'casual') {
      this.gameId = crypto.randomUUID();
      gamesRepo
        .createGame(
          this.db,
          this.gameId,
          this.roomCode,
          this.gameType,
          this.players.size,
          this.totalQuestionCount,
          this.hostId,
          this.questionSetId ?? undefined,
          this.questionSetIds.length > 0 ? this.questionSetIds : undefined,
        )
        .catch((err) => console.error('Failed to create game session:', err));
    }

    this.phase = 'COUNTDOWN';
    this.logEvent('GAME_STARTED', null, {
      gameType: this.gameType,
      playerCount: this.players.size,
      totalQuestions: this.totalQuestionCount,
      questionSetId: this.questionSetId,
    });

    let countdown = COUNTDOWN_SECONDS;
    this.countdownRemaining = countdown;
    this.broadcast({ type: 'GAME_STARTING', payload: { countdown } });

    this.countdownTimer = setInterval(() => {
      countdown--;
      this.countdownRemaining = countdown;
      if (countdown <= 0) {
        this.clearTimer('countdown');
        this.showNextQuestion();
      } else {
        this.broadcast({ type: 'GAME_STARTING', payload: { countdown } });
      }
    }, 1000);
  }

  /** Remember a served question ID for cross-game de-duplication (bounded, deduped). */
  private recordServedQuestion(id: string): void {
    const existing = this.recentlyServedQuestionIds.indexOf(id);
    if (existing !== -1) this.recentlyServedQuestionIds.splice(existing, 1);
    this.recentlyServedQuestionIds.push(id);
    const overflow = this.recentlyServedQuestionIds.length - RECENT_QUESTION_MEMORY;
    if (overflow > 0) this.recentlyServedQuestionIds.splice(0, overflow);
  }

  private showNextQuestion(): void {
    if (this.currentQuestionIndex >= this.totalQuestionCount) {
      this.endGame();
      return;
    }

    let q: QuestionWithMeta;

    const usePoolSelection =
      (this.isMetaSet || (this.gameType === 'custom' && this.adaptiveMode)) &&
      this.questionPool.length > 0;

    if (usePoolSelection) {
      // Meta set or custom adaptive: dynamically select from remaining pool
      const remaining = this.questionPool.filter((qn) => !this.usedQuestionIds.has(qn.id));
      if (remaining.length === 0) {
        this.endGame();
        return;
      }
      // Skip photos whose year has already been served twice this game, so an
      // adaptive/meta run honours the same cap as non-adaptive selection.
      const served = this.questionPool.filter((qn) => this.usedQuestionIds.has(qn.id));
      const eligible = filterOverusedPictureYears(remaining, served);
      q = this.selectQuestionForRound(eligible);
      this.usedQuestionIds.add(q.id);
    } else {
      // Configured (authored order) or casual (random from DB)
      if (this.currentQuestionIndex >= this.questions.length) {
        this.endGame();
        return;
      }
      q = this.questions[this.currentQuestionIndex];
    }

    this.activeQuestion = q;
    this.recordServedQuestion(q.id);

    // Compute per-player difficulties for this question
    this.computeRoundDifficulties(q);

    // Show MEDIA_PREVIEW first for an image and/or a listen-first audio clip.
    const hasPreviewAudio = q.audio?.play === 'preview';
    if (q.media || hasPreviewAudio) {
      this.phase = 'MEDIA_PREVIEW';
      // Prefer the preview clip's authored duration; fall back to the image
      // preview duration, then the default.
      const previewDuration =
        (hasPreviewAudio ? q.audio?.duration : undefined) ?? q.media?.previewDuration ?? 5;

      this.broadcast({
        type: 'MEDIA_PREVIEW',
        payload: {
          questionId: q.id,
          questionNumber: this.currentQuestionIndex + 1,
          totalQuestions: this.totalQuestionCount,
          ...this.previewMediaFields(q),
          duration: previewDuration,
        },
      });

      // Wait for the host TV to signal the image has loaded (max 10s),
      // then start the actual preview countdown.
      // If the image doesn't load within 10s, skip the preview entirely.
      this.waitingForMediaLoad = true;
      this.pendingMediaQuestion = q;
      this.pendingPreviewDuration = previewDuration;
      this.mediaPreviewEndsAt = 0;

      this.mediaLoadWaitTimeout = setTimeout(() => {
        this.mediaLoadWaitTimeout = null;
        if (!this.waitingForMediaLoad) return;
        this.waitingForMediaLoad = false;
        this.pendingMediaQuestion = null;
        this.mediaPreviewEndsAt = 0;
        this.sendQuestion(q);
      }, MEDIA_LOAD_TIMEOUT_MS);
    } else {
      this.sendQuestion(q);
    }
  }

  /** Host TV signals that the media preview image finished loading (or failed). */
  private onMediaLoaded(success = true, questionId?: string): void {
    if (!this.waitingForMediaLoad) return;
    // Ignore stale messages from a previous question's media preview
    if (questionId && this.pendingMediaQuestion && questionId !== this.pendingMediaQuestion.id)
      return;
    if (this.mediaLoadWaitTimeout) {
      clearTimeout(this.mediaLoadWaitTimeout);
      this.mediaLoadWaitTimeout = null;
    }

    if (success) {
      this.startPreviewCountdown();
    } else {
      // Image failed to load — skip preview, go straight to question
      this.waitingForMediaLoad = false;
      const q = this.pendingMediaQuestion;
      this.pendingMediaQuestion = null;
      this.mediaPreviewEndsAt = 0;
      if (q) this.sendQuestion(q);
    }
  }

  /** Begin the preview countdown after the image loaded (or the load wait timed out). */
  private startPreviewCountdown(): void {
    if (!this.waitingForMediaLoad) return;
    this.waitingForMediaLoad = false;

    const q = this.pendingMediaQuestion;
    const previewDuration = this.pendingPreviewDuration;
    this.pendingMediaQuestion = null;

    if (!q) return;

    this.mediaPreviewEndsAt = Date.now() + previewDuration * 1000;
    this.mediaPreviewTimeout = setTimeout(() => {
      this.mediaPreviewTimeout = null;
      this.mediaPreviewEndsAt = 0;
      this.sendQuestion(q);
    }, previewDuration * 1000);
  }

  private sendQuestion(q: QuestionWithMeta): void {
    const timeLimit = this.configuredTimeLimit ?? q.timeLimit ?? DEFAULT_QUESTION_TIME_LIMIT;

    this.phase = 'QUESTION';
    this.mediaPreviewEndsAt = 0;
    this.answers.clear();
    this.questionStartTime = Date.now();

    const tags = !q.hideTags && q.tags.length > 0 ? q.tags : undefined;

    const payload = {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.totalQuestionCount,
      serverTimestamp: this.questionStartTime,
      tags,
      media: q.media
        ? { type: q.media.type, url: q.media.url, previewDuration: q.media.previewDuration }
        : undefined,
      audio: q.audio ?? undefined,
    };

    this.broadcast({ type: 'QUESTION', payload });

    // Warm the next question's media on the host while this one plays.
    this.requestPreload();

    this.logEvent('QUESTION_SENT', null, {
      questionId: q.id,
      text: q.text,
      correctAnswer: q.correctAnswer,
      options: q.options,
      timeLimit,
      questionNumber: this.currentQuestionIndex + 1,
    });

    let remaining = timeLimit;
    this.questionTimer = setInterval(() => {
      remaining--;
      this.broadcast({ type: 'TICK', payload: { remaining } });

      if (remaining <= 0) {
        this.endQuestion();
      } else {
        // Check if all connected players answered
        if (this.allConnectedPlayersAnswered()) {
          this.endQuestion();
        }
      }
    }, 1000);
  }

  private allConnectedPlayersAnswered(): boolean {
    const connected = this.connectedPlayerCount;
    return connected > 0 && this.answers.size >= connected;
  }

  private async handleIdentify(
    ws: ServerWebSocket<WSData>,
    deviceId: string,
    sessionToken?: string,
    invitationToken?: string,
  ): Promise<void> {
    debugLog('[room] identify start', {
      roomCode: this.roomCode,
      hasDeviceId: !!deviceId,
      hasSessionToken: !!sessionToken,
      hasInvitationToken: !!invitationToken,
      hostId: this.hostId,
    });

    let payload: IdentityPayload = { profile: null };
    let effectiveHostId = this.hostId;

    try {
      // If an invitation token is provided, validate it and link the device to the host
      if (invitationToken && !sessionToken) {
        const invite = await invitationTokensRepo.validate(this.db, hashToken(invitationToken));
        if (invite) {
          effectiveHostId = invite.hostId;
          // Revoke any existing guest sessions for this device+host to prevent accumulation
          await sessionsRepo.revokeGuestByDevice(this.db, deviceId, invite.hostId);
          // Create a guest session (90-day TTL)
          const rawToken = generateSecureToken();
          const tokenHash = hashToken(rawToken);
          const expiresAt = sqliteDateFromNow(GUEST_SESSION_TTL_DAYS);
          await sessionsRepo.create(this.db, tokenHash, invite.hostId, 'guest', {
            deviceId,
            expiresAt,
          });
          // Include guest session token and server URL in the response
          payload.guestSessionToken = rawToken;
          payload.serverUrl = (ws.data as WSData).serverBaseUrl || '';
        }
      }

      // If a session token is provided (returning user), validate it and use its hostId
      if (sessionToken) {
        const session = await sessionsRepo.validate(this.db, hashToken(sessionToken));
        if (session) {
          effectiveHostId = session.hostId;
        }
      }

      const existing = await playersRepo.findByDeviceId(this.db, deviceId, effectiveHostId);
      if (existing) {
        payload = {
          ...payload,
          profile: {
            displayName: existing.displayName,
            totalGames: existing.totalGames,
            totalWins: existing.totalWins,
          },
        };
      } else {
        // No bound profile — include available admin-created profiles
        const available = await playersRepo.listAvailableProfiles(this.db, effectiveHostId);
        if (available.length > 0) {
          payload.availableProfiles = available.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            avatarColor: p.avatarColor,
            avatarEmoji: p.avatarEmoji ?? '',
            totalGames: p.totalGames,
          }));
        }
      }
    } catch (err) {
      console.error('IDENTIFY lookup failed:', err);
    }

    // Guest linking: if the client provides an invitationToken, validate it
    // against this room's stored token and create a guest session
    if (invitationToken && this.invitationToken && this.hostId) {
      if (invitationToken === this.invitationToken) {
        try {
          const rawGuestToken = generateSecureToken();
          const guestTokenHash = hashToken(rawGuestToken);

          // Persist guest session in DB (type 'guest')
          await sessionsRepo.create(this.db, guestTokenHash, this.hostId, 'guest', {
            deviceInfo: `Guest device ${deviceId}`,
          });

          // Store in-memory mapping so AUTO room resolution works
          guestSessions.set(guestTokenHash, {
            hostId: this.hostId,
            roomCode: this.roomCode,
          });

          payload.guestSessionToken = rawGuestToken;

          // Derive server URL from the host WS connection if available
          if (this.hostWs) {
            // The server URL is inferred from the listening port
            const port = process.env.PORT || '3000';
            payload.serverUrl = `http://localhost:${port}`;
          }
        } catch (err) {
          console.error('Guest session creation failed:', err);
        }
      } else {
        console.warn(`Invalid invitation token for room ${this.roomCode} from device ${deviceId}`);
      }
    }

    debugLog('[room] identify result', {
      roomCode: this.roomCode,
      hasProfile: !!payload.profile,
      availableProfiles: payload.availableProfiles?.length ?? 0,
      hasGuestSessionToken: !!payload.guestSessionToken,
      hasServerUrl: !!payload.serverUrl,
    });

    this.sendTo(ws, { type: 'IDENTITY', payload });
  }

  private async handleUnbind(ws: ServerWebSocket<WSData>, deviceId: string): Promise<void> {
    try {
      // Find the profile bound to this device and unbind it
      const existing = await playersRepo.findByDeviceId(this.db, deviceId, this.hostId);
      if (existing) {
        await playersRepo.unbindDevice(this.db, existing.id);
      }
    } catch (err) {
      console.error('UNBIND failed:', err);
    }
    // After unbinding, send a fresh identity response (will include available profiles)
    await this.handleIdentify(ws, deviceId);
  }

  private handleAnswer(ws: ServerWebSocket<WSData>, questionId: string, answer: AnswerKey): void {
    if (this.phase !== 'QUESTION') {
      this.logEvent('ANSWER_RECEIVED', ws.data.playerId ?? null, {
        questionId,
        answer,
        rejected: true,
        reason: `phase is ${this.phase}, expected QUESTION`,
      });
      return;
    }

    const q = this.getCurrentQuestion();
    if (!q || q.id !== questionId) {
      this.logEvent('ANSWER_RECEIVED', ws.data.playerId ?? null, {
        questionId,
        answer,
        rejected: true,
        reason: `questionId mismatch: expected ${q?.id ?? 'none'}, got ${questionId}`,
      });
      return;
    }

    const playerId = ws.data.playerId;
    if (!playerId || this.answers.has(playerId)) return;

    const serverReceivedAt = Date.now();
    this.answers.set(playerId, { answer, serverReceivedAt });

    const isCorrect = answer === q.correctAnswer;
    this.logEvent('ANSWER_RECEIVED', playerId, {
      questionId,
      answer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      responseTimeMs: serverReceivedAt - this.questionStartTime,
    });

    this.sendTo(ws, {
      type: 'ANSWER_ACK',
      payload: { questionId, serverReceivedAt },
    });

    // Notify the host so TV can update the answered count
    this.sendToHost({
      type: 'PLAYER_ANSWERED',
      payload: { playerId, questionId },
    });

    // Check if all connected players answered
    if (this.allConnectedPlayersAnswered()) {
      this.endQuestion();
    }
  }

  private endQuestion(): void {
    if (this.phase !== 'QUESTION') return;
    this.clearTimer('question');
    this.phase = 'REVEALING';

    this.broadcast({ type: 'REVEALING' });

    this.revealTimeout = setTimeout(() => {
      this.showRoundResults();
    }, REVEAL_DELAY_MS);
  }

  private showRoundResults(): void {
    const q = this.getCurrentQuestion();
    if (!q) {
      this.endGame();
      return;
    }

    const correctAnswer = q.correctAnswer as AnswerKey;
    const timeLimit = this.configuredTimeLimit ?? q.timeLimit ?? DEFAULT_QUESTION_TIME_LIMIT;

    // Amplify the speed bonus for answer-while-playing subject-audio questions.
    const speedBonusMultiplier = computeSpeedBonusMultiplier(q.audio);

    const playerResults: PlayerResult[] = [];
    const preRoundScores = [...this.players.values()].map((p) => p.score);
    const allLifetimeScores = [...this.players.values()].map((p) => p.lifetimeScore);

    for (const player of this.players.values()) {
      const ans = this.answers.get(player.playerId);
      const isCorrect = ans?.answer === correctAnswer;
      let responseTimeMs: number | null = null;
      let basePoints = 0;
      let timeBonus = 0;

      if (ans) {
        responseTimeMs = ans.serverReceivedAt - this.questionStartTime;
        ({ basePoints, timeBonus } = calculateScore(
          isCorrect,
          responseTimeMs,
          timeLimit,
          speedBonusMultiplier,
        ));
      }

      // Position-based time bonus multiplier (trailing players get a boost)
      // Skip catch-up for custom non-adaptive mode
      const skipCatchUp = this.gameType === 'custom' && !this.adaptiveMode;
      const tbMultiplier = skipCatchUp
        ? 1.0
        : computeTimeBonusMultiplier(
            player.score,
            preRoundScores,
            this.currentQuestionIndex,
            this.totalQuestionCount,
          );
      const adjustedScore = basePoints + timeBonus * tbMultiplier;

      // Apply difficulty multiplier and lifetime handicap
      const playerDifficulty =
        this.currentRoundDifficulties.get(player.playerId) ?? q.difficulty ?? 3;
      const diffMultiplier = difficultyMultiplier(playerDifficulty);
      const lifetimeHandicap = computeLifetimeHandicap(player.lifetimeScore, allLifetimeScores);
      const pointsEarned = Math.round(adjustedScore * diffMultiplier * lifetimeHandicap);

      if (pointsEarned > 0) {
        player.score += pointsEarned;
      }

      playerResults.push({
        playerId: player.playerId,
        name: player.name,
        answer: ans?.answer ?? null,
        isCorrect,
        responseTimeMs,
        baseScore: basePoints + timeBonus,
        difficultyMultiplier: diffMultiplier,
        timeBonusMultiplier: tbMultiplier,
        lifetimeHandicap,
        pointsEarned,
        totalScore: player.score,
        difficulty: playerDifficulty,
      });
    }

    // Compute rankings for this round
    const rankings = this.buildRankings();

    // Track position history
    this.positionHistory.push({
      round: this.currentQuestionIndex + 1,
      positions: rankings.map((r) => ({
        playerId: r.playerId,
        name: r.name,
        rank: r.rank,
        score: r.score,
      })),
    });

    this.phase = 'RESULTS';

    const roundResult: RoundResult = {
      questionId: q.id,
      correctAnswer,
      tags: q.tags.length > 0 ? q.tags : undefined,
      questionDifficulty: q.difficulty ?? 3,
      playerResults,
      rankings,
    };
    this.lastRoundResult = roundResult;

    this.broadcast({ type: 'ROUND_END', payload: roundResult });

    // Track question usage (fire-and-forget)
    questionsRepo
      .markQuestionAsked(this.db, q.id)
      .catch((err) => console.error('Failed to update question usage:', err));

    // Record round results and update tag scores (configured games only)
    if (this.gameId) {
      const gameId = this.gameId;
      const roundNumber = this.currentQuestionIndex + 1;
      const roundResults: Parameters<typeof gamesRepo.insertRoundResults>[2] = playerResults.map(
        (pr) => {
          const playerRanking = rankings.find((r) => r.playerId === pr.playerId);
          const player = this.players.get(pr.playerId);
          return {
            questionId: q.id,
            roundNumber,
            playerId: pr.playerId,
            playerName: pr.name,
            answer: pr.answer,
            isCorrect: pr.isCorrect,
            responseTimeMs: pr.responseTimeMs,
            pointsEarned: pr.pointsEarned,
            totalScore: pr.totalScore,
            rank: playerRanking?.rank ?? 0,
            profileId: player?.profileId ?? null,
          };
        },
      );
      gamesRepo
        .insertRoundResults(this.db, gameId, roundResults)
        .catch((err) => console.error('Failed to insert round results:', err));

      // Update tag scores for profiled players (skip for custom non-adaptive)
      if (this.gameType !== 'custom' || this.adaptiveMode) {
        this.updateTagScoresAfterRound(q, playerResults).catch((err) =>
          console.error('Failed to update tag scores:', err),
        );
      }
    }

    this.resultsTimeout = setTimeout(() => {
      this.resultsTimeout = null;
      this.advanceWhenPreloadReady();
    }, RESULTS_DELAY_MS);
  }

  /**
   * Ask the host to warm the *next* question's media (KTD3). Only the
   * deterministic path (authored/casual/configured/custom) can peek
   * `questions[i+1]`; adaptive/meta picks at advance-time and can't be peeked,
   * so it skips preload and relies on the at-preview MEDIA_LOADED handshake.
   */
  private requestPreload(): void {
    this.clearPreloadState();

    const usePoolSelection =
      (this.isMetaSet || (this.gameType === 'custom' && this.adaptiveMode)) &&
      this.questionPool.length > 0;
    const nextIndex = this.currentQuestionIndex + 1;
    if (
      usePoolSelection ||
      nextIndex >= this.totalQuestionCount ||
      nextIndex >= this.questions.length
    ) {
      return;
    }

    const next = this.questions[nextIndex];
    const image = next.media?.url;
    const audio = next.audio?.url;
    if (!image && !audio) return;

    this.preloadQuestionId = next.id;
    this.preloadAcked = false;
    this.sendToHost({ type: 'MEDIA_PRELOAD', payload: { questionId: next.id, image, audio } });
  }

  /** Host TV signals it has warmed (or failed to warm) the next question's media. */
  private onMediaPreloaded(success: boolean, questionId: string): void {
    // Ignore stale acks from an earlier preload request.
    if (!this.preloadQuestionId || questionId !== this.preloadQuestionId) return;
    // Any ack (success or failure) releases the hold — a failed prefetch still
    // gets a second chance via the at-preview MEDIA_LOADED handshake.
    void success;
    this.preloadAcked = true;
    if (this.awaitingPreloadAdvance) this.advanceToNextQuestion();
  }

  /**
   * Hold the results→next-question advance until the host has the upcoming
   * media in hand (KTD4). Advances immediately when no preload is pending or it
   * is already acked; otherwise waits for the ack with a timeout backstop.
   */
  private advanceWhenPreloadReady(): void {
    if (this.preloadQuestionId && !this.preloadAcked) {
      this.awaitingPreloadAdvance = true;
      this.preloadHoldTimeout = setTimeout(() => {
        this.preloadHoldTimeout = null;
        this.advanceToNextQuestion();
      }, PRELOAD_HOLD_TIMEOUT_MS);
      return;
    }
    this.advanceToNextQuestion();
  }

  private advanceToNextQuestion(): void {
    this.awaitingPreloadAdvance = false;
    if (this.preloadHoldTimeout) {
      clearTimeout(this.preloadHoldTimeout);
      this.preloadHoldTimeout = null;
    }
    this.currentQuestionIndex++;
    if (this.currentQuestionIndex < this.totalQuestionCount) {
      this.showNextQuestion();
    } else {
      this.endGame();
    }
  }

  private clearPreloadState(): void {
    this.preloadQuestionId = null;
    this.preloadAcked = false;
  }

  private buildRankings(): PlayerRanking[] {
    return rankPlayers(
      [...this.players.values()].map((p) => ({
        id: p.playerId,
        name: p.name,
        score: p.score,
      })),
    ).map((r) => ({
      playerId: r.id,
      name: r.name,
      score: r.score,
      rank: r.rank,
    }));
  }

  private endGame(): void {
    this.phase = 'GAME_OVER';

    const rankings = this.buildRankings();

    const winner = rankings[0] ?? { playerId: '', name: '', score: 0 };

    this.broadcast({
      type: 'GAME_OVER',
      payload: {
        rankings,
        winner: {
          playerId: winner.playerId,
          name: winner.name,
          score: winner.score,
        },
        positionHistory: this.positionHistory,
      },
    });

    this.logEvent('GAME_ENDED', null, {
      winner: winner.name,
      winnerScore: winner.score,
      rankings: rankings.map((r) => ({ name: r.name, score: r.score, rank: r.rank })),
    });

    // Record game end and update player stats (configured games only)
    if (this.gameId) {
      this.recordGameEnd(winner, rankings).catch((err) =>
        console.error('Failed to record game end:', err),
      );
    }
  }

  private async recordGameEnd(
    winner: { playerId: string; name: string; score: number },
    _rankings: PlayerRanking[],
  ): Promise<void> {
    if (!this.gameId) return;

    // Find the winner's profile ID (if they have one)
    const winnerPlayer = this.players.get(winner.playerId);
    const winnerProfileId = winnerPlayer?.profileId ?? null;

    await gamesRepo.endGame(this.db, this.gameId, winnerProfileId, winner.name);

    // Update stats for all players who have profiles
    for (const player of this.players.values()) {
      if (!player.profileId) continue;
      await playersRepo.incrementGames(this.db, player.profileId, player.score);
      if (player.playerId === winner.playerId) {
        await playersRepo.incrementWins(this.db, player.profileId);
      }
      // Increment games_played on all tag scores for decay tracking (skip for custom non-adaptive)
      if (this.gameType !== 'custom' || this.adaptiveMode) {
        playerTagScoresRepo
          .incrementGamesPlayed(this.db, player.profileId)
          .catch((err) => console.error('Failed to increment tag games played:', err));
      }
    }
  }

  // ── Tag-based personalization helpers ─────────────────────────

  private async loadPlayerTagScores(): Promise<void> {
    this.playerTagScores.clear();
    const profiledPlayerIds = [...this.players.values()]
      .filter((p) => p.profileId)
      .map((p) => p.profileId!);

    if (profiledPlayerIds.length === 0) return;

    try {
      const allScores = await playerTagScoresRepo.getTagScoresForPlayers(
        this.db,
        profiledPlayerIds,
      );
      for (const [profileId, tagScores] of allScores) {
        const scoreMap = new Map<string, number>();
        // Get the current player's total games for decay calculation
        for (const ts of tagScores) {
          scoreMap.set(ts.tag, decayedScore(ts.score, ts.gamesPlayed));
        }
        this.playerTagScores.set(profileId, scoreMap);
      }
    } catch (err) {
      console.error('Failed to load player tag scores:', err);
    }
  }

  private selectQuestionForRound(remaining: QuestionWithMeta[]): QuestionWithMeta {
    const players = [...this.players.values()]
      .filter((p) => p.profileId)
      .map((p) => ({
        profileId: p.profileId!,
        name: p.name,
        currentScore: p.score,
      }));

    if (players.length === 0) {
      // No profiled players — random pick (tag avoidance is skipped; it requires
      // selectNextQuestion which needs at least one profiled player for scoring)
      return remaining[Math.floor(Math.random() * remaining.length)];
    }

    return selectNextQuestion(remaining, {
      players,
      playerTagScores: this.playerTagScores,
      roundIndex: this.currentQuestionIndex,
      totalRounds: this.totalQuestionCount,
      previousQuestionTags: this.activeQuestion?.tags,
    });
  }

  private computeRoundDifficulties(q: QuestionWithMeta): void {
    this.currentRoundDifficulties.clear();
    const absoluteDifficulty = q.difficulty ?? 3;

    for (const player of this.players.values()) {
      if (player.profileId && q.tags.length > 0) {
        const tagScores = this.playerTagScores.get(player.profileId) ?? new Map<string, number>();
        const eloDifficulty = computePlayerDifficulty(tagScores, q.tags);
        const blended = computeEffectiveDifficulty(absoluteDifficulty, eloDifficulty);
        const effective = resolvePlayerDifficulty(player.name, q.playerDifficulty, blended);
        this.currentRoundDifficulties.set(player.playerId, effective);
      } else {
        this.currentRoundDifficulties.set(player.playerId, absoluteDifficulty);
      }
    }
  }

  private get totalQuestionCount(): number {
    if (this.gameType === 'custom') {
      return this.configuredTotalQuestions ?? this.questions.length;
    }
    if (this.gameType === 'configured' || this.questionPool.length === 0) {
      return this.questions.length;
    }
    return this.configuredTotalQuestions ?? TOTAL_QUESTIONS;
  }

  private getCurrentQuestion(): QuestionWithMeta | null {
    return this.activeQuestion;
  }

  private async updateTagScoresAfterRound(
    question: QuestionWithMeta,
    playerResults: PlayerResult[],
  ): Promise<void> {
    if (question.tags.length === 0) return;

    for (const result of playerResults) {
      const player = this.players.get(result.playerId);
      if (!player?.profileId) continue;

      const playerScores = this.playerTagScores.get(player.profileId) ?? new Map<string, number>();
      const updates = computeTagUpdates(question.tags, result.isCorrect, playerScores);

      for (const update of updates) {
        // Update DB (fire-and-forget per tag)
        playerTagScoresRepo
          .upsertTagScore(
            this.db,
            crypto.randomUUID(),
            player.profileId,
            update.tag,
            update.delta,
            result.isCorrect,
            this.hostId,
            ELO_BASELINE,
          )
          .catch((err) => console.error('Failed to upsert tag score:', err));

        // Update in-memory scores for next round's question selection
        const existing = this.playerTagScores.get(player.profileId) ?? new Map<string, number>();
        existing.set(update.tag, (existing.get(update.tag) ?? ELO_BASELINE) + update.delta);
        this.playerTagScores.set(player.profileId, existing);
      }
    }
  }

  reset(): void {
    this.clearAllTimers();
    this.phase = 'LOBBY';
    this.questions = [];
    this.questionPool = [];
    this.usedQuestionIds.clear();
    this.currentQuestionIndex = 0;
    this.answers.clear();
    this.positionHistory = [];
    this.activeQuestion = null;
    this.gameId = null;
    this.lastRoundResult = null;
    this.countdownRemaining = 0;
    this.mediaPreviewEndsAt = 0;
    this.configurePromise = null;
    this.playerTagScores.clear();
    this.currentRoundDifficulties.clear();

    // Reset scores and clear disconnect timers, but keep players
    for (const player of this.players.values()) {
      player.score = 0;
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = undefined;
      }
    }
  }

  // ── Messaging ────────────────────────────────────────────────

  private sendTo(ws: ServerWebSocket<WSData>, message: ServerMessage): void {
    if (message.type === 'IDENTITY' || message.type === 'WELCOME' || message.type === 'ERROR') {
      debugLog('[room] send', {
        role: ws.data.role,
        roomCode: this.roomCode,
        playerId: ws.data.playerId || undefined,
        type: message.type,
        code: message.type === 'ERROR' ? message.payload.code : undefined,
      });
    }
    ws.send(JSON.stringify(message));
  }

  private sendToHost(message: ServerMessage): void {
    if (this.hostWs) {
      this.sendTo(this.hostWs, message);
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    // Send to all connected players
    for (const player of this.players.values()) {
      player.ws?.send(data);
    }
    // Send to host
    this.hostWs?.send(data);
  }

  // ── Timer cleanup ────────────────────────────────────────────

  private clearTimer(which: 'countdown' | 'question'): void {
    if (which === 'countdown' && this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (which === 'question' && this.questionTimer) {
      clearInterval(this.questionTimer);
      this.questionTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearTimer('countdown');
    this.clearTimer('question');
    if (this.revealTimeout) {
      clearTimeout(this.revealTimeout);
      this.revealTimeout = null;
    }
    if (this.resultsTimeout) {
      clearTimeout(this.resultsTimeout);
      this.resultsTimeout = null;
    }
    if (this.mediaLoadWaitTimeout) {
      clearTimeout(this.mediaLoadWaitTimeout);
      this.mediaLoadWaitTimeout = null;
    }
    this.waitingForMediaLoad = false;
    this.pendingMediaQuestion = null;
    this.mediaPreviewEndsAt = 0;
    if (this.mediaPreviewTimeout) {
      clearTimeout(this.mediaPreviewTimeout);
      this.mediaPreviewTimeout = null;
    }
    if (this.preloadHoldTimeout) {
      clearTimeout(this.preloadHoldTimeout);
      this.preloadHoldTimeout = null;
    }
    this.awaitingPreloadAdvance = false;
    this.clearPreloadState();
  }

  cleanup(): void {
    // Notify all connected clients before closing
    const closeMsg = JSON.stringify({
      type: 'ERROR',
      payload: { code: 'ROOM_CLOSED', message: 'Room has been closed' },
    });

    // Notify host
    if (this.hostWs) {
      try {
        this.hostWs.send(closeMsg);
        this.hostWs.close();
      } catch {
        /* WS may already be closed */
      }
    }

    // Notify all players
    for (const player of this.players.values()) {
      if (player.ws) {
        try {
          player.ws.send(closeMsg);
          player.ws.close();
        } catch {
          /* WS may already be closed */
        }
      }
    }

    this.clearAllTimers();
    for (const player of this.players.values()) {
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
      }
    }
    this.players.clear();
    this.hostWs = null;
  }

  // ── Event logging ───────────────────────────────────────────

  private logEvent(
    eventType: Parameters<typeof eventsRepo.logEvent>[1]['eventType'],
    playerId: string | null,
    data?: Record<string, unknown>,
  ): void {
    eventsRepo
      .logEvent(this.db, {
        gameId: this.gameId,
        roomCode: this.roomCode,
        eventType,
        playerId,
        hostId: this.hostId,
        data,
      })
      .catch((err) => console.error('Failed to log event:', err));
  }
}
