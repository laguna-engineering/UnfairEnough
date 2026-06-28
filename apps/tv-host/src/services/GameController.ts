/**
 * Game Controller
 * Orchestrates the game flow, timing, and scoring
 */

import {
  playersRepo,
  playerTagScoresRepo,
  type QuestionWithMeta,
  questionsRepo,
} from '@unfairenough/db';
import {
  addPlayer,
  addPoints,
  buildQuestionPool,
  calculateScore,
  computeEffectiveDifficulty,
  computeLifetimeHandicap,
  computePlayerDifficulty,
  computeTagUpdates,
  computeTimeBonusMultiplier,
  createStore,
  decayedScore,
  difficultyMultiplier,
  ELO_BASELINE,
  endGame,
  nextQuestion,
  playersSelectors,
  type RootState,
  rankPlayers,
  receiveAnswer,
  removePlayer,
  resetGame,
  resolvePlayerDifficulty,
  selectNextQuestion,
  setPlayerConnected,
  setServerReady,
  showMediaPreview,
  showQuestion,
  showRoundResults,
  startGameCountdown,
  startRevealing,
  tickGameCountdown,
  tickQuestionTimer,
  updateConfig,
} from '@unfairenough/game-logic';
import type { AnswerKey, PlayerResult } from '@unfairenough/ws-protocol';
import { getDb, initDatabase } from './database';
import type { IGameController } from './IGameController';
import { wsServer } from './WebSocketServer';

const MEDIA_LOAD_TIMEOUT_MS = 10_000;

/** In-memory player profile info resolved at join time */
interface LocalPlayerProfile {
  profileId: string;
  deviceId: string;
  lifetimeScore: number;
}

class GameController implements IGameController {
  private store = createStore();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private questionTimer: ReturnType<typeof setInterval> | null = null;
  private mediaLoadWaitTimeout: ReturnType<typeof setTimeout> | null = null;
  private mediaPreviewTimeout: ReturnType<typeof setTimeout> | null = null;
  private revealTimeout: ReturnType<typeof setTimeout> | null = null;
  private resultsTimeout: ReturnType<typeof setTimeout> | null = null;

  // Media load tracking — wait for image to render before starting preview countdown
  private waitingForMediaLoad = false;
  private pendingMediaQuestion: QuestionWithMeta | null = null;
  private pendingPreviewDuration = 0;

  // Question state — keep full QuestionWithMeta for tags, difficulty, etc.
  private questionPool: QuestionWithMeta[] = [];
  private usedQuestionIds = new Set<string>();
  private currentQuestionIndex = 0;
  private activeQuestion: QuestionWithMeta | null = null;
  private questionStartTime = 0;

  // Tag-based personalization state
  private playerProfiles = new Map<string, LocalPlayerProfile>(); // playerId -> profile
  private playerTagScores = new Map<string, Map<string, number>>(); // profileId -> tag -> decayed score
  private currentRoundDifficulties = new Map<string, number>(); // playerId -> difficulty
  private isMetaSet = false;
  private language = 'en';

  constructor() {
    this.setupServerCallbacks();
  }

  private setupServerCallbacks() {
    wsServer.setCallbacks({
      onServerReady: (data) => {
        this.store.dispatch(setServerReady(data));
      },
      onPlayerJoined: (data) => {
        this.store.dispatch(
          addPlayer({
            id: data.playerId,
            name: data.name,
            color: data.color,
            emoji: data.emoji,
            score: 0,
            isConnected: true,
          }),
        );
        // Resolve player profile if deviceId was provided
        if (data.deviceId) {
          this.resolvePlayerProfile(data.playerId, data.name, data.deviceId);
        }
      },
      onPlayerDisconnected: (data) => {
        this.store.dispatch(setPlayerConnected({ id: data.playerId, isConnected: false }));
      },
      onPlayerReconnected: (data) => {
        this.store.dispatch(setPlayerConnected({ id: data.playerId, isConnected: true }));
      },
      onPlayerLeft: (data) => {
        // Timer expired or intentional LEAVE — full removal
        this.store.dispatch(removePlayer(data.playerId));
        this.playerProfiles.delete(data.playerId);
      },
      onAnswerReceived: (data) => {
        this.handleAnswer(data);
      },
    });
  }

  /**
   * Resolve player profile from deviceId — look up or create in local DB.
   */
  private async resolvePlayerProfile(
    playerId: string,
    name: string,
    deviceId: string,
  ): Promise<void> {
    try {
      const db = getDb();
      const existing = await playersRepo.findByDeviceId(db, deviceId, null);
      if (existing) {
        this.playerProfiles.set(playerId, {
          profileId: existing.id,
          deviceId,
          lifetimeScore: existing.totalScore,
        });
        if (existing.displayName !== name) {
          await playersRepo.updateDisplayName(db, existing.id, name);
        } else {
          await playersRepo.updateLastSeen(db, existing.id);
        }
      } else {
        const profileId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const player = playersSelectors.selectById(this.store.getState().players, playerId);
        await playersRepo.createPlayer(
          db,
          profileId,
          name,
          player?.color ?? '#FFFFFF',
          null,
          deviceId,
        );
        this.playerProfiles.set(playerId, { profileId, deviceId, lifetimeScore: 0 });
      }
    } catch (err) {
      console.error('Player profile resolution failed:', err);
    }
  }

  async initialize(): Promise<void> {
    await initDatabase();
    await wsServer.start();
  }

  getState(): RootState {
    return this.store.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Start the game with countdown
   */
  startGame(): void {
    const state = this.getState();
    const playerCount = playersSelectors.selectTotal(state.players);

    if (playerCount < state.game.config.minPlayers) {
      console.warn('Not enough players to start');
      return;
    }

    this.loadQuestionsAndStart().catch((err) => {
      console.error('Failed to load questions:', err);
    });
  }

  /**
   * Load questions, build pool, load tag scores, and start the countdown.
   */
  private async loadQuestionsAndStart(): Promise<void> {
    const db = getDb();
    const state = this.getState();
    const { gameType, questionSetId, questionSetIds, adaptiveMode, totalQuestions } =
      state.game.config;

    // Load tag scores for profiled players (configured or custom adaptive)
    if (gameType === 'configured' || (gameType === 'custom' && adaptiveMode)) {
      await this.loadPlayerTagScores();
    }

    if (gameType === 'custom' && questionSetIds && questionSetIds.length > 0) {
      // Custom mode: load from multiple sets
      const rawPool = await questionsRepo.getQuestionsBySetIds(db, questionSetIds);

      if (adaptiveMode) {
        // Adaptive: use selection pipeline
        this.questionPool = buildQuestionPool(rawPool, {
          nRounds: totalQuestions,
          playerTagScores: this.playerTagScores,
        });
      } else {
        // Non-adaptive: Fisher-Yates shuffle then slice
        const shuffled = [...rawPool];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        this.questionPool = shuffled.slice(0, totalQuestions);
      }
    } else if (gameType === 'configured' && questionSetId && !this.isMetaSet) {
      // Regular configured set: serve in authored order
      this.questionPool = await questionsRepo.getQuestionsBySet(db, questionSetId);
    } else {
      // Casual mode or meta set: use adaptive selection pipeline
      let rawPool: QuestionWithMeta[];

      if (this.isMetaSet && questionSetId) {
        // Meta set: load freshest questions from child sets (ordered by last_asked_at)
        rawPool = await questionsRepo.getQuestionsByMetaSet(db, questionSetId, totalQuestions * 3);
      } else {
        // Casual mode: load 3× from the general pool
        rawPool = await questionsRepo.getRandomQuestions(
          db,
          totalQuestions * 3,
          null,
          undefined,
          this.language,
        );
      }

      if (gameType === 'casual') {
        // Casual: completely random (DB already orders by freshness + random)
        this.questionPool = rawPool;
      } else {
        // Meta set: use adaptive selection pipeline
        this.questionPool = buildQuestionPool(rawPool, {
          nRounds: totalQuestions,
          playerTagScores: this.playerTagScores,
        });
      }
    }

    if (this.questionPool.length === 0) {
      console.warn('No questions available');
      return;
    }

    this.currentQuestionIndex = 0;
    this.usedQuestionIds.clear();

    this.store.dispatch(startGameCountdown());
    wsServer.sendGameStarting(3);

    this.countdownTimer = setInterval(() => {
      this.store.dispatch(tickGameCountdown());
      const newState = this.getState();

      if (newState.game.countdown <= 0) {
        this.clearCountdownTimer();
        this.showNextQuestion();
      } else {
        wsServer.sendGameStarting(newState.game.countdown);
      }
    }, 1000);
  }

  /**
   * Load decayed tag scores for all profiled players into memory.
   */
  private async loadPlayerTagScores(): Promise<void> {
    this.playerTagScores.clear();
    const profileIds = [...this.playerProfiles.values()].map((p) => p.profileId);
    if (profileIds.length === 0) return;

    try {
      const db = getDb();
      const allScores = await playerTagScoresRepo.getTagScoresForPlayers(db, profileIds);
      for (const [profileId, tagScores] of allScores) {
        const scoreMap = new Map<string, number>();
        for (const ts of tagScores) {
          scoreMap.set(ts.tag, decayedScore(ts.score, ts.gamesPlayed));
        }
        this.playerTagScores.set(profileId, scoreMap);
      }
    } catch (err) {
      console.error('Failed to load player tag scores:', err);
    }
  }

  private get totalQuestionCount(): number {
    const state = this.getState();
    const { gameType, totalQuestions } = state.game.config;
    if (gameType === 'custom') return Math.min(totalQuestions, this.questionPool.length);
    if (gameType === 'configured') return this.questionPool.length;
    return Math.min(totalQuestions, this.questionPool.length);
  }

  /**
   * Get the current question — configured mode uses index, casual mode uses last used ID.
   */
  private getCurrentQuestion(): QuestionWithMeta | null {
    return this.activeQuestion;
  }

  /**
   * Show the next question (with optional media preview)
   */
  private showNextQuestion(): void {
    if (this.currentQuestionIndex >= this.totalQuestionCount) {
      this.endGame();
      return;
    }

    let question: QuestionWithMeta;

    const state = this.getState();
    const { gameType, adaptiveMode } = state.game.config;
    const usePoolSelection =
      (this.isMetaSet || (gameType === 'custom' && adaptiveMode)) &&
      this.questionPool.length > this.currentQuestionIndex;

    if (usePoolSelection) {
      // Meta set or custom adaptive: dynamically select from remaining pool
      const remaining = this.questionPool.filter((q) => !this.usedQuestionIds.has(q.id));
      if (remaining.length === 0) {
        this.endGame();
        return;
      }

      const players = this.buildSelectionPlayers();
      if (players.length === 0) {
        question = remaining[Math.floor(Math.random() * remaining.length)];
      } else {
        question = selectNextQuestion(remaining, {
          players,
          playerTagScores: this.playerTagScores,
          roundIndex: this.currentQuestionIndex,
          totalRounds: this.totalQuestionCount,
          previousQuestionTags: this.activeQuestion?.tags,
        });
      }
      this.usedQuestionIds.add(question.id);
    } else {
      // Configured (authored order) or casual (random from DB)
      if (this.currentQuestionIndex >= this.questionPool.length) {
        this.endGame();
        return;
      }
      question = this.questionPool[this.currentQuestionIndex];
    }

    this.activeQuestion = question;

    // Compute per-player difficulties for this question
    this.computeRoundDifficulties(question);

    const media = question.media;

    if (media) {
      const previewDuration = media.previewDuration ?? 5;

      const previewPayload = {
        questionId: question.id,
        questionNumber: this.currentQuestionIndex + 1,
        totalQuestions: this.totalQuestionCount,
        media: { type: media.type as 'image' | 'audio' | 'video', url: media.url },
        duration: previewDuration,
      };

      this.store.dispatch(showMediaPreview(previewPayload));
      wsServer.broadcast({ type: 'MEDIA_PREVIEW', payload: previewPayload });

      // Wait for the TV to signal the image has loaded (max 10s),
      // then start the actual preview countdown.
      // If the image doesn't load within 10s, skip the preview entirely.
      this.waitingForMediaLoad = true;
      this.pendingMediaQuestion = question;
      this.pendingPreviewDuration = previewDuration;

      this.mediaLoadWaitTimeout = setTimeout(() => {
        this.mediaLoadWaitTimeout = null;
        if (!this.waitingForMediaLoad) return;
        this.waitingForMediaLoad = false;
        this.pendingMediaQuestion = null;
        this.sendQuestion(question);
      }, MEDIA_LOAD_TIMEOUT_MS);
    } else {
      this.sendQuestion(question);
    }
  }

  /**
   * Build RoundSelectionPlayer array from profiled players for selectNextQuestion.
   */
  private buildSelectionPlayers() {
    const state = this.getState();
    const players = playersSelectors.selectAll(state.players);
    return players
      .filter((p) => this.playerProfiles.has(p.id))
      .map((p) => ({
        profileId: this.playerProfiles.get(p.id)!.profileId,
        name: p.name,
        currentScore: p.score,
      }));
  }

  /**
   * Compute per-player difficulty for the current question.
   */
  private computeRoundDifficulties(q: QuestionWithMeta): void {
    this.currentRoundDifficulties.clear();
    const state = this.getState();
    const players = playersSelectors.selectAll(state.players);
    const absoluteDifficulty = q.difficulty ?? 3;

    for (const player of players) {
      const profile = this.playerProfiles.get(player.id);
      if (profile && q.tags.length > 0) {
        const tagScores = this.playerTagScores.get(profile.profileId) ?? new Map<string, number>();
        const eloDifficulty = computePlayerDifficulty(tagScores, q.tags);
        const blended = computeEffectiveDifficulty(absoluteDifficulty, eloDifficulty);
        const effective = resolvePlayerDifficulty(player.name, q.playerDifficulty, blended);
        this.currentRoundDifficulties.set(player.id, effective);
      } else {
        this.currentRoundDifficulties.set(player.id, absoluteDifficulty);
      }
    }
  }

  /**
   * Signal that the media preview image has finished loading (or failed) on the TV.
   * On success: starts the preview countdown immediately instead of waiting for the 10s timeout.
   * On failure: skips the preview entirely and shows the question.
   */
  notifyMediaLoaded(success = true, questionId?: string): void {
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
      const question = this.pendingMediaQuestion;
      this.pendingMediaQuestion = null;
      if (question) this.sendQuestion(question);
    }
  }

  /**
   * Begin the preview countdown after the image has loaded (or the load wait timed out).
   */
  private startPreviewCountdown(): void {
    if (!this.waitingForMediaLoad) return;
    this.waitingForMediaLoad = false;

    const question = this.pendingMediaQuestion;
    const previewDuration = this.pendingPreviewDuration;
    this.pendingMediaQuestion = null;

    if (!question) return;

    this.mediaPreviewTimeout = setTimeout(() => {
      this.mediaPreviewTimeout = null;
      this.sendQuestion(question);
    }, previewDuration * 1000);
  }

  /**
   * Send the actual question (after optional media preview)
   */
  private sendQuestion(question: QuestionWithMeta): void {
    const state = this.getState();
    const timeLimit = state.game.config.questionTimeLimit;

    const tags = !question.hideTags && question.tags.length > 0 ? question.tags : undefined;

    const questionPayload = {
      id: question.id,
      text: question.text,
      options: question.options,
      timeLimit,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.totalQuestionCount,
      serverTimestamp: Date.now(),
      tags,
    };

    this.questionStartTime = Date.now();
    this.store.dispatch(showQuestion(questionPayload));
    wsServer.sendQuestion(questionPayload);

    // Start question timer
    this.questionTimer = setInterval(() => {
      this.store.dispatch(tickQuestionTimer());
      const newState = this.getState();

      wsServer.sendTick(newState.game.countdown);

      if (newState.game.countdown <= 0) {
        this.endQuestion();
      } else {
        // Check if all connected players answered
        const connectedPlayers = playersSelectors
          .selectAll(newState.players)
          .filter((p) => p.isConnected);
        const answeredCount = Object.keys(newState.game.answers).length;
        if (answeredCount >= connectedPlayers.length && connectedPlayers.length > 0) {
          this.endQuestion();
        }
      }
    }, 1000);
  }

  /**
   * Handle an incoming answer
   */
  private handleAnswer(data: {
    playerId: string;
    questionId: string;
    answer: AnswerKey;
    serverReceivedAt: number;
  }): void {
    const state = this.getState();
    if (state.game.phase !== 'QUESTION') return;
    if (state.game.currentQuestion?.id !== data.questionId) return;

    this.store.dispatch(
      receiveAnswer({
        playerId: data.playerId,
        answer: data.answer,
        serverReceivedAt: data.serverReceivedAt,
      }),
    );
  }

  /**
   * End the current question and show results
   */
  private endQuestion(): void {
    this.clearQuestionTimer();
    this.store.dispatch(startRevealing());

    // Brief reveal animation delay
    this.revealTimeout = setTimeout(() => {
      this.revealTimeout = null;
      this.showRoundResults();
    }, 2000);
  }

  /**
   * Calculate and show round results with difficulty multipliers
   */
  private showRoundResults(): void {
    const state = this.getState();
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      this.endGame();
      return;
    }

    const correctAnswer = currentQuestion.correctAnswer as AnswerKey;
    const timeLimit = state.game.config.questionTimeLimit;

    const players = playersSelectors.selectAll(state.players);
    const answers = state.game.answers;

    const preRoundScores = players.map((p) => p.score);
    const allLifetimeScores = players.map((p) => this.playerProfiles.get(p.id)?.lifetimeScore ?? 0);

    const playerResults: PlayerResult[] = players.map((player) => {
      const playerAnswer = answers[player.id];
      const isCorrect = playerAnswer?.answer === correctAnswer;
      let responseTimeMs: number | null = null;
      let basePoints = 0;
      let timeBonus = 0;

      if (playerAnswer) {
        responseTimeMs = playerAnswer.serverReceivedAt - this.questionStartTime;
        ({ basePoints, timeBonus } = calculateScore(isCorrect, responseTimeMs, timeLimit));
      }

      // Position-based time bonus multiplier (trailing players get a boost)
      // Skip catch-up for custom non-adaptive mode
      const { gameType: gt, adaptiveMode: am } = state.game.config;
      const skipCatchUp = gt === 'custom' && !am;
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
        this.currentRoundDifficulties.get(player.id) ?? currentQuestion.difficulty ?? 3;
      const diffMultiplier = difficultyMultiplier(playerDifficulty);
      const playerLifetimeScore = this.playerProfiles.get(player.id)?.lifetimeScore ?? 0;
      const lifetimeHandicap = computeLifetimeHandicap(playerLifetimeScore, allLifetimeScores);
      const pointsEarned = Math.round(adjustedScore * diffMultiplier * lifetimeHandicap);

      // Update score in store
      if (pointsEarned > 0) {
        this.store.dispatch(addPoints({ id: player.id, points: pointsEarned }));
      }

      // Get updated score
      const updatedState = this.getState();
      const updatedPlayer = playersSelectors.selectById(updatedState.players, player.id);

      return {
        playerId: player.id,
        name: player.name,
        answer: playerAnswer?.answer ?? null,
        isCorrect,
        responseTimeMs,
        baseScore: basePoints + timeBonus,
        difficultyMultiplier: diffMultiplier,
        timeBonusMultiplier: tbMultiplier,
        lifetimeHandicap,
        pointsEarned,
        totalScore: updatedPlayer?.score ?? player.score,
        difficulty: playerDifficulty,
      };
    });

    // Compute rankings
    const updatedState = this.getState();
    const updatedPlayers = playersSelectors.selectAll(updatedState.players);
    const rankings = rankPlayers(
      updatedPlayers.map((p) => ({ id: p.id, name: p.name, score: p.score })),
    ).map((r) => ({
      playerId: r.id,
      name: r.name,
      score: r.score,
      rank: r.rank,
    }));

    this.store.dispatch(
      showRoundResults({
        results: playerResults,
        rankings,
        correctAnswer,
        tags: currentQuestion.tags.length > 0 ? currentQuestion.tags : undefined,
      }),
    );

    // Broadcast results with tags
    wsServer.broadcast({
      type: 'ROUND_END',
      payload: {
        questionId: currentQuestion.id,
        correctAnswer,
        tags: currentQuestion.tags.length > 0 ? currentQuestion.tags : undefined,
        questionDifficulty: currentQuestion.difficulty ?? 3,
        playerResults,
        rankings,
      },
    });

    // Track question usage (fire-and-forget)
    questionsRepo
      .markQuestionAsked(getDb(), currentQuestion.id)
      .catch((err) => console.error('Failed to update question usage:', err));

    // Update tag scores for profiled players (skip for casual and custom non-adaptive)
    const cfg = this.getState().game.config;
    if (cfg.gameType === 'configured' || (cfg.gameType === 'custom' && cfg.adaptiveMode)) {
      this.updateTagScoresAfterRound(currentQuestion, playerResults).catch((err) =>
        console.error('Failed to update tag scores:', err),
      );
    }

    // Move to next question after showing results
    this.resultsTimeout = setTimeout(() => {
      this.resultsTimeout = null;
      this.currentQuestionIndex++;
      if (this.currentQuestionIndex < this.totalQuestionCount) {
        this.store.dispatch(nextQuestion());
        this.showNextQuestion();
      } else {
        this.endGame();
      }
    }, 5000);
  }

  /**
   * Update tag scores in-memory and persist to local DB after each round.
   */
  private async updateTagScoresAfterRound(
    question: QuestionWithMeta,
    playerResults: PlayerResult[],
  ): Promise<void> {
    if (question.tags.length === 0) return;

    const db = getDb();

    for (const result of playerResults) {
      const profile = this.playerProfiles.get(result.playerId);
      if (!profile) continue;

      const playerScores = this.playerTagScores.get(profile.profileId) ?? new Map<string, number>();
      const updates = computeTagUpdates(question.tags, result.isCorrect, playerScores);

      for (const update of updates) {
        // Persist to local DB
        const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        playerTagScoresRepo
          .upsertTagScore(
            db,
            id,
            profile.profileId,
            update.tag,
            update.delta,
            result.isCorrect,
            null,
            ELO_BASELINE,
          )
          .catch((err) => console.error('Failed to upsert tag score:', err));

        // Update in-memory scores for next round's question selection
        const existing = this.playerTagScores.get(profile.profileId) ?? new Map<string, number>();
        existing.set(update.tag, (existing.get(update.tag) ?? ELO_BASELINE) + update.delta);
        this.playerTagScores.set(profile.profileId, existing);
      }
    }
  }

  /**
   * End the game and show final results
   */
  private endGame(): void {
    this.store.dispatch(endGame());

    const state = this.getState();
    const players = playersSelectors.selectAll(state.players);
    const rankings = rankPlayers(players.map((p) => ({ id: p.id, name: p.name, score: p.score })));

    const winner = rankings[0] || { playerId: '', name: '', score: 0 };

    wsServer.broadcast({
      type: 'GAME_OVER',
      payload: {
        rankings: rankings.map((r) => ({
          playerId: r.id,
          name: r.name,
          score: r.score,
          rank: r.rank,
        })),
        winner: {
          playerId: winner.id,
          name: winner.name,
          score: winner.score,
        },
        positionHistory: state.game.positionHistory,
      },
    });

    // Record game stats (non-casual games) and update tag decay (when adaptive)
    if (state.game.config.gameType !== 'casual') {
      this.recordGameEnd(winner).catch((err) => console.error('Failed to record game end:', err));
      if (state.game.config.gameType !== 'custom' || state.game.config.adaptiveMode) {
        this.incrementTagGamesPlayed().catch((err) =>
          console.error('Failed to increment tag games played:', err),
        );
      }
    }
  }

  /**
   * Record game-end stats for all profiled players (lifetime score + wins).
   */
  private async recordGameEnd(winner: { id: string }): Promise<void> {
    const db = getDb();
    const state = this.getState();
    const players = playersSelectors.selectAll(state.players);

    for (const player of players) {
      const profile = this.playerProfiles.get(player.id);
      if (!profile) continue;
      await playersRepo.incrementGames(db, profile.profileId, player.score);
      if (player.id === winner.id) {
        await playersRepo.incrementWins(db, profile.profileId);
      }
    }
  }

  /**
   * Increment games_played for decay tracking on all profiled players' tag scores.
   */
  private async incrementTagGamesPlayed(): Promise<void> {
    const db = getDb();
    for (const profile of this.playerProfiles.values()) {
      playerTagScoresRepo
        .incrementGamesPlayed(db, profile.profileId)
        .catch((err) => console.error('Failed to increment tag games played:', err));
    }
  }

  /**
   * Configure game mode
   */
  configureGame(
    gameType: 'casual' | 'configured' | 'custom',
    questionSetId?: string,
    options?: {
      questionSetIds?: string[];
      totalQuestions?: number;
      questionTimeLimit?: number;
      adaptiveMode?: boolean;
    },
  ): void {
    if (gameType === 'custom' && options?.questionSetIds && options.questionSetIds.length > 0) {
      this.store.dispatch(
        updateConfig({
          gameType,
          questionSetId: undefined,
          questionSetIds: options.questionSetIds,
          adaptiveMode: options.adaptiveMode ?? true,
          totalQuestions: options.totalQuestions ?? 10,
          questionTimeLimit: options.questionTimeLimit ?? 15,
        }),
      );
      this.isMetaSet = false;
    } else if (gameType === 'configured' && questionSetId) {
      this.store.dispatch(
        updateConfig({
          gameType,
          questionSetId,
          questionSetIds: undefined,
          adaptiveMode: undefined,
        }),
      );

      const db = getDb();
      questionsRepo
        .getQuestionSet(db, questionSetId)
        .then((set) => {
          if (!set || set.questionCount === 0) {
            console.warn('Question set not found or empty:', questionSetId);
            this.store.dispatch(updateConfig({ gameType: 'casual', questionSetId: undefined }));
            this.isMetaSet = false;
          } else {
            this.isMetaSet = set.isMeta;
            this.store.dispatch(updateConfig({ totalQuestions: set.questionCount }));
          }
        })
        .catch((err) => {
          console.error('Failed to validate question set:', err);
        });
    } else {
      this.store.dispatch(
        updateConfig({
          gameType: 'casual',
          questionSetId: undefined,
          questionSetIds: undefined,
          adaptiveMode: undefined,
        }),
      );
      this.isMetaSet = false;
    }
  }

  setLanguage(language: string): void {
    this.language = language;
    wsServer.setLanguage(language);
  }

  /**
   * Reset and return to lobby
   */
  reset(): void {
    this.clearAllTimers();
    this.store.dispatch(resetGame());
    this.questionPool = [];
    this.usedQuestionIds.clear();
    this.currentQuestionIndex = 0;
    this.activeQuestion = null;
    this.playerTagScores.clear();
    this.currentRoundDifficulties.clear();
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private clearQuestionTimer(): void {
    if (this.questionTimer) {
      clearInterval(this.questionTimer);
      this.questionTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearCountdownTimer();
    this.clearQuestionTimer();
    if (this.mediaLoadWaitTimeout) {
      clearTimeout(this.mediaLoadWaitTimeout);
      this.mediaLoadWaitTimeout = null;
    }
    this.waitingForMediaLoad = false;
    this.pendingMediaQuestion = null;
    if (this.mediaPreviewTimeout) {
      clearTimeout(this.mediaPreviewTimeout);
      this.mediaPreviewTimeout = null;
    }
    if (this.revealTimeout) {
      clearTimeout(this.revealTimeout);
      this.revealTimeout = null;
    }
    if (this.resultsTimeout) {
      clearTimeout(this.resultsTimeout);
      this.resultsTimeout = null;
    }
  }

  cleanup(): void {
    this.clearAllTimers();
    wsServer.stop();
  }
}

// Singleton instance
export const gameController = new GameController();
