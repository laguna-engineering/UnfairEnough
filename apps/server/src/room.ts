import type { DbAdapter, QuestionWithMeta } from '@unfairenough/db';
import { gamesRepo, playersRepo, playerTagScoresRepo, questionsRepo } from '@unfairenough/db';
import type {
  AnswerKey,
  ClientMessage,
  PlayerRanking,
  PlayerResult,
  PositionSnapshot,
  ServerMessage,
  WelcomePayload,
} from '@unfairenough/ws-protocol';
import { generatePlayerId, parseClientMessage } from '@unfairenough/ws-protocol';
import type { ServerWebSocket } from 'bun';
import {
  buildQuestionPool,
  selectNextQuestion,
} from '../../../packages/game-logic/src/utils/questionSelection';
import { calculateScore, rankPlayers } from '../../../packages/game-logic/src/utils/scoring';
import {
  computePlayerDifficulty,
  computeTagUpdates,
  decayedScore,
  difficultyMultiplier,
  resolvePlayerDifficulty,
} from '../../../packages/game-logic/src/utils/tagScoring';
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

const DEFAULT_QUESTION_TIME_LIMIT = 10;
const MAX_PLAYERS = 12;

const TOTAL_QUESTIONS = 5;
const COUNTDOWN_SECONDS = 3;
const REVEAL_DELAY_MS = 2000;
const RESULTS_DELAY_MS = 5000;

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

export class GameRoom {
  readonly roomCode: string;
  private readonly db: DbAdapter;

  private phase: GamePhase = 'LOBBY';
  private players = new Map<string, RoomPlayer>();
  private hostWs: ServerWebSocket<WSData> | null = null;
  private colorIndex = 0;
  private language = 'en';

  // Game state
  private questions: QuestionWithMeta[] = [];
  private questionPool: QuestionWithMeta[] = [];
  private usedQuestionIds = new Set<string>();
  private currentQuestionIndex = 0;
  private questionStartTime = 0;
  private answers = new Map<string, PlayerAnswer>();
  private positionHistory: PositionSnapshot[] = [];
  private gameId: string | null = null;

  // Tag-based personalization state
  private playerTagScores = new Map<string, Map<string, number>>();
  private currentRoundDifficulties = new Map<string, number>();

  // Game configuration
  private gameType: 'casual' | 'configured' = 'casual';
  private questionSetId: string | null = null;
  private configuredTotalQuestions: number | null = null;
  private configuredTimeLimit: number | null = null;

  // Timers
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private questionTimer: ReturnType<typeof setInterval> | null = null;
  private revealTimeout: ReturnType<typeof setTimeout> | null = null;
  private resultsTimeout: ReturnType<typeof setTimeout> | null = null;
  private mediaPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(roomCode: string, db: DbAdapter) {
    this.roomCode = roomCode;
    this.db = db;
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
  ): Promise<string | null> {
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
    const color = COLORS[this.colorIndex++ % COLORS.length];

    // Look up or create player profile
    let profileId: string | undefined;
    const welcomePayload: WelcomePayload = {
      playerId,
      playerColor: color,
      roomCode: this.roomCode,
      language: this.language,
    };

    if (deviceId) {
      try {
        const existingProfile = await playersRepo.findByDeviceId(this.db, deviceId);
        if (existingProfile) {
          profileId = existingProfile.id;
          // Update name if changed, and touch last_seen_at
          if (existingProfile.displayName !== name) {
            await playersRepo.updateDisplayName(this.db, existingProfile.id, name);
          } else {
            await playersRepo.updateLastSeen(this.db, existingProfile.id);
          }
          welcomePayload.profile = {
            displayName: existingProfile.displayName,
            totalGames: existingProfile.totalGames,
            totalWins: existingProfile.totalWins,
          };
        } else {
          // Create new profile
          profileId = crypto.randomUUID();
          await playersRepo.createPlayer(this.db, profileId, name, color, deviceId);
        }
      } catch (err) {
        // Don't block joining if DB fails — play as anonymous
        console.error('Player profile lookup failed:', err);
      }
    }

    this.players.set(playerId, { playerId, name, color, score: 0, ws, deviceId, profileId });

    // Update the ws data so we can identify this connection later
    ws.data.playerId = playerId;

    // Send WELCOME to the joining player
    this.sendTo(ws, { type: 'WELCOME', payload: welcomePayload });

    // Broadcast PLAYER_JOINED to everyone (including host)
    this.broadcast({
      type: 'PLAYER_JOINED',
      payload: { playerId, name, color },
    });

    return playerId;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.broadcast({ type: 'PLAYER_LEFT', payload: { playerId } });
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

  // ── Message handling ─────────────────────────────────────────

  handlePlayerMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer): void {
    let message: ClientMessage;
    try {
      message = parseClientMessage(raw.toString());
    } catch {
      this.sendTo(ws, {
        type: 'ERROR',
        payload: { code: 'INVALID_MESSAGE', message: 'Invalid message format' },
      });
      return;
    }

    switch (message.type) {
      case 'JOIN': {
        this.addPlayer(ws, message.payload.name, message.payload.deviceId);
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
        // TODO: reconnection support
        break;
      }
    }
  }

  handleHostMessage(_ws: ServerWebSocket<WSData>, raw: string | Buffer): void {
    let message: HostMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
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
        this.configureGame(message.payload);
        break;
    }
  }

  // ── Game configuration ───────────────────────────────────────

  private async configureGame(
    payload: import('@unfairenough/ws-protocol').ConfigureGamePayload,
  ): Promise<void> {
    if (this.phase !== 'LOBBY') return;

    if (payload.gameType === 'configured' && payload.questionSetId) {
      // Validate the set exists and has questions
      const set = await questionsRepo.getQuestionSet(this.db, payload.questionSetId);
      if (!set) {
        this.sendToHost({
          type: 'ERROR',
          payload: { code: 'SET_NOT_FOUND', message: 'Question set not found' },
        });
        return;
      }

      const questions = await questionsRepo.getQuestionsBySet(this.db, payload.questionSetId);
      if (questions.length === 0) {
        this.sendToHost({
          type: 'ERROR',
          payload: { code: 'SET_EMPTY', message: 'Question set has no questions' },
        });
        return;
      }

      this.gameType = 'configured';
      this.questionSetId = payload.questionSetId;
      this.configuredTotalQuestions = payload.totalQuestions ?? null;
      this.configuredTimeLimit = payload.questionTimeLimit ?? null;

      this.sendToHost({
        type: 'GAME_CONFIGURED',
        payload: { gameType: 'configured', questionCount: questions.length },
      });
    } else {
      this.gameType = 'casual';
      this.questionSetId = null;
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

    // Load tag scores early — needed for both pool building and per-round selection
    await this.loadPlayerTagScores();

    // Load questions based on game configuration
    if (this.gameType === 'configured' && this.questionSetId) {
      this.questions = await questionsRepo.getQuestionsBySet(this.db, this.questionSetId);
      // Optionally limit to N questions
      if (this.configuredTotalQuestions && this.configuredTotalQuestions < this.questions.length) {
        this.questions = this.questions.slice(0, this.configuredTotalQuestions);
      }
      this.questionPool = [];
    } else {
      // Casual mode: load 3× the requested count, curate via buildQuestionPool
      const requestedCount = this.configuredTotalQuestions ?? TOTAL_QUESTIONS;
      const rawPool = await questionsRepo.getRandomQuestions(this.db, requestedCount * 3);

      this.questionPool = buildQuestionPool(rawPool, {
        nRounds: requestedCount,
        playerTagScores: this.playerTagScores,
      });
      // Pre-select first batch for fallback (in case pool is small)
      this.questions = this.questionPool.slice(0, requestedCount);
    }
    if (this.questions.length === 0 && this.questionPool.length === 0) return;

    this.currentQuestionIndex = 0;
    this.positionHistory = [];
    this.usedQuestionIds.clear();

    // Create game session in DB
    this.gameId = crypto.randomUUID();
    gamesRepo
      .createGame(
        this.db,
        this.gameId,
        this.roomCode,
        this.gameType,
        this.players.size,
        this.totalQuestionCount,
        this.questionSetId ?? undefined,
      )
      .catch((err) => console.error('Failed to create game session:', err));

    this.phase = 'COUNTDOWN';

    let countdown = COUNTDOWN_SECONDS;
    this.broadcast({ type: 'GAME_STARTING', payload: { countdown } });

    this.countdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        this.clearTimer('countdown');
        this.showNextQuestion();
      } else {
        this.broadcast({ type: 'GAME_STARTING', payload: { countdown } });
      }
    }, 1000);
  }

  private showNextQuestion(): void {
    if (this.currentQuestionIndex >= this.totalQuestionCount) {
      this.endGame();
      return;
    }

    let q: QuestionWithMeta;

    if (this.gameType === 'configured' || this.questionPool.length === 0) {
      // Configured mode: use authored order
      if (this.currentQuestionIndex >= this.questions.length) {
        this.endGame();
        return;
      }
      q = this.questions[this.currentQuestionIndex];
    } else {
      // Casual mode: dynamically select from remaining pool
      const remaining = this.questionPool.filter((qn) => !this.usedQuestionIds.has(qn.id));
      if (remaining.length === 0) {
        this.endGame();
        return;
      }
      q = this.selectQuestionForRound(remaining);
      this.usedQuestionIds.add(q.id);
    }

    // Compute per-player difficulties for this question
    this.computeRoundDifficulties(q);

    // If question has media, show MEDIA_PREVIEW first
    if (q.media) {
      this.phase = 'MEDIA_PREVIEW';
      const previewDuration = q.media.previewDuration ?? 5;

      this.broadcast({
        type: 'MEDIA_PREVIEW',
        payload: {
          questionNumber: this.currentQuestionIndex + 1,
          totalQuestions: this.totalQuestionCount,
          media: { type: q.media.type, url: q.media.url },
          duration: previewDuration,
        },
      });

      // After preview duration, send the actual question
      this.mediaPreviewTimeout = setTimeout(() => {
        this.mediaPreviewTimeout = null;
        this.sendQuestion(q);
      }, previewDuration * 1000);
    } else {
      this.sendQuestion(q);
    }
  }

  private sendQuestion(q: QuestionWithMeta): void {
    const timeLimit = this.configuredTimeLimit ?? q.timeLimit ?? DEFAULT_QUESTION_TIME_LIMIT;

    this.phase = 'QUESTION';
    this.answers.clear();
    this.questionStartTime = Date.now();

    const payload = {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.totalQuestionCount,
      serverTimestamp: this.questionStartTime,
      media: q.media
        ? { type: q.media.type, url: q.media.url, previewDuration: q.media.previewDuration }
        : undefined,
    };

    this.broadcast({ type: 'QUESTION', payload });

    let remaining = timeLimit;
    this.questionTimer = setInterval(() => {
      remaining--;
      this.broadcast({ type: 'TICK', payload: { remaining } });

      if (remaining <= 0) {
        this.endQuestion();
      } else {
        // Check if all players answered
        if (this.answers.size >= this.players.size && this.players.size > 0) {
          this.endQuestion();
        }
      }
    }, 1000);
  }

  private handleAnswer(ws: ServerWebSocket<WSData>, questionId: string, answer: AnswerKey): void {
    if (this.phase !== 'QUESTION') return;

    const q = this.getCurrentQuestion();
    if (!q || q.id !== questionId) return;

    const playerId = ws.data.playerId;
    if (!playerId || this.answers.has(playerId)) return;

    const serverReceivedAt = Date.now();
    this.answers.set(playerId, { answer, serverReceivedAt });

    this.sendTo(ws, {
      type: 'ANSWER_ACK',
      payload: { questionId, serverReceivedAt },
    });

    // Check if all players answered
    if (this.answers.size >= this.players.size && this.players.size > 0) {
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

    const playerResults: PlayerResult[] = [];

    for (const player of this.players.values()) {
      const ans = this.answers.get(player.playerId);
      const isCorrect = ans?.answer === correctAnswer;
      let responseTimeMs: number | null = null;
      let baseScore = 0;

      if (ans) {
        responseTimeMs = ans.serverReceivedAt - this.questionStartTime;
        baseScore = calculateScore(isCorrect, responseTimeMs, timeLimit);
      }

      // Apply difficulty multiplier
      const playerDifficulty = this.currentRoundDifficulties.get(player.playerId) ?? 2.5;
      const multiplier = difficultyMultiplier(playerDifficulty);
      const pointsEarned = Math.round(baseScore * multiplier);

      if (pointsEarned > 0) {
        player.score += pointsEarned;
      }

      playerResults.push({
        playerId: player.playerId,
        name: player.name,
        answer: ans?.answer ?? null,
        isCorrect,
        responseTimeMs,
        baseScore,
        difficultyMultiplier: multiplier,
        pointsEarned,
        totalScore: player.score,
        difficulty: playerDifficulty,
      });
    }

    // Compute rankings for this round
    const rankings: PlayerRanking[] = rankPlayers(
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

    this.broadcast({
      type: 'ROUND_END',
      payload: {
        questionId: q.id,
        correctAnswer,
        tags: q.tags.length > 0 ? q.tags : undefined,
        playerResults,
        rankings,
      },
    });

    // Record round results and update tag scores (async, don't block gameplay)
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

      // Update tag scores for profiled players (fire-and-forget + update in-memory)
      this.updateTagScoresAfterRound(q, playerResults).catch((err) =>
        console.error('Failed to update tag scores:', err),
      );
    }

    this.resultsTimeout = setTimeout(() => {
      this.currentQuestionIndex++;
      if (this.currentQuestionIndex < this.totalQuestionCount) {
        this.showNextQuestion();
      } else {
        this.endGame();
      }
    }, RESULTS_DELAY_MS);
  }

  private endGame(): void {
    this.phase = 'GAME_OVER';

    const rankings: PlayerRanking[] = rankPlayers(
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

    // Record game end and update player stats (async, don't block)
    this.recordGameEnd(winner, rankings).catch((err) =>
      console.error('Failed to record game end:', err),
    );
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
      // Increment games_played on all tag scores for decay tracking
      playerTagScoresRepo
        .incrementGamesPlayed(this.db, player.profileId)
        .catch((err) => console.error('Failed to increment tag games played:', err));
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
      // No profiled players — random pick
      return remaining[Math.floor(Math.random() * remaining.length)];
    }

    return selectNextQuestion(remaining, {
      players,
      playerTagScores: this.playerTagScores,
      roundIndex: this.currentQuestionIndex,
      totalRounds: this.totalQuestionCount,
    });
  }

  private computeRoundDifficulties(q: QuestionWithMeta): void {
    this.currentRoundDifficulties.clear();
    for (const player of this.players.values()) {
      if (player.profileId && q.tags.length > 0) {
        const tagScores = this.playerTagScores.get(player.profileId) ?? new Map<string, number>();
        const dynamicDifficulty = computePlayerDifficulty(tagScores, q.tags);
        const effective = resolvePlayerDifficulty(
          player.name,
          q.playerDifficulty,
          dynamicDifficulty,
        );
        this.currentRoundDifficulties.set(player.playerId, effective);
      } else {
        this.currentRoundDifficulties.set(player.playerId, 2.5);
      }
    }
  }

  private get totalQuestionCount(): number {
    if (this.gameType === 'configured' || this.questionPool.length === 0) {
      return this.questions.length;
    }
    return this.configuredTotalQuestions ?? TOTAL_QUESTIONS;
  }

  private getCurrentQuestion(): QuestionWithMeta | null {
    if (this.gameType === 'configured' || this.questionPool.length === 0) {
      return this.questions[this.currentQuestionIndex] ?? null;
    }
    // Casual mode: the last used question is tracked via usedQuestionIds
    // Find the question that was selected for this round
    const usedIds = [...this.usedQuestionIds];
    const lastUsedId = usedIds[this.currentQuestionIndex];
    if (!lastUsedId) return null;
    return this.questionPool.find((q) => q.id === lastUsedId) ?? null;
  }

  private async updateTagScoresAfterRound(
    question: QuestionWithMeta,
    playerResults: PlayerResult[],
  ): Promise<void> {
    if (question.tags.length === 0) return;

    for (const result of playerResults) {
      const player = this.players.get(result.playerId);
      if (!player?.profileId) continue;

      const updates = computeTagUpdates(question.tags, result.isCorrect, result.baseScore);

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
          )
          .catch((err) => console.error('Failed to upsert tag score:', err));

        // Update in-memory scores for next round's question selection
        const existing = this.playerTagScores.get(player.profileId) ?? new Map<string, number>();
        existing.set(update.tag, (existing.get(update.tag) ?? 0) + update.delta);
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
    this.gameId = null;
    this.gameType = 'casual';
    this.questionSetId = null;
    this.configuredTotalQuestions = null;
    this.configuredTimeLimit = null;
    this.playerTagScores.clear();
    this.currentRoundDifficulties.clear();

    // Reset scores but keep players
    for (const player of this.players.values()) {
      player.score = 0;
    }
  }

  // ── Messaging ────────────────────────────────────────────────

  private sendTo(ws: ServerWebSocket<WSData>, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  private sendToHost(message: ServerMessage): void {
    if (this.hostWs) {
      this.sendTo(this.hostWs, message);
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    // Send to all players
    for (const player of this.players.values()) {
      player.ws.send(data);
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
    if (this.mediaPreviewTimeout) {
      clearTimeout(this.mediaPreviewTimeout);
      this.mediaPreviewTimeout = null;
    }
  }

  cleanup(): void {
    this.clearAllTimers();
    this.players.clear();
    this.hostWs = null;
  }
}
