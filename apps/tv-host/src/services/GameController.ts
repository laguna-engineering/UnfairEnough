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
  computePlayerDifficulty,
  computeTagUpdates,
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

/** In-memory player profile info resolved at join time */
interface LocalPlayerProfile {
  profileId: string;
  deviceId: string;
}

class GameController implements IGameController {
  private store = createStore();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private questionTimer: ReturnType<typeof setInterval> | null = null;
  private mediaPreviewTimeout: ReturnType<typeof setTimeout> | null = null;
  private revealTimeout: ReturnType<typeof setTimeout> | null = null;
  private resultsTimeout: ReturnType<typeof setTimeout> | null = null;

  // Question state — keep full QuestionWithMeta for tags, difficulty, etc.
  private questionPool: QuestionWithMeta[] = [];
  private usedQuestionIds = new Set<string>();
  private currentQuestionIndex = 0;
  private questionStartTime = 0;

  // Tag-based personalization state
  private playerProfiles = new Map<string, LocalPlayerProfile>(); // playerId -> profile
  private playerTagScores = new Map<string, Map<string, number>>(); // profileId -> tag -> decayed score
  private currentRoundDifficulties = new Map<string, number>(); // playerId -> difficulty
  private isMetaSet = false;

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
      const existing = await playersRepo.findByDeviceId(db, deviceId);
      if (existing) {
        this.playerProfiles.set(playerId, { profileId: existing.id, deviceId });
        if (existing.displayName !== name) {
          await playersRepo.updateDisplayName(db, existing.id, name);
        } else {
          await playersRepo.updateLastSeen(db, existing.id);
        }
      } else {
        const profileId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const player = playersSelectors.selectById(this.store.getState().players, playerId);
        await playersRepo.createPlayer(db, profileId, name, player?.color ?? '#FFFFFF', deviceId);
        this.playerProfiles.set(playerId, { profileId, deviceId });
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
    const { gameType, questionSetId, totalQuestions } = state.game.config;

    // Load tag scores for profiled players
    await this.loadPlayerTagScores();

    if (gameType === 'configured' && questionSetId && !this.isMetaSet) {
      // Regular configured set: serve in authored order
      this.questionPool = await questionsRepo.getQuestionsBySet(db, questionSetId);
    } else {
      // Casual mode or meta set: use adaptive selection pipeline
      let rawPool: QuestionWithMeta[];

      if (this.isMetaSet && questionSetId) {
        // Meta set: load all questions from child sets
        rawPool = await questionsRepo.getQuestionsByMetaSet(db, questionSetId);
      } else {
        // Casual mode: load 3× from the general pool
        rawPool = await questionsRepo.getRandomQuestions(db, totalQuestions * 3);
      }

      this.questionPool = buildQuestionPool(rawPool, {
        nRounds: totalQuestions,
        playerTagScores: this.playerTagScores,
      });
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
    if (gameType === 'configured') return this.questionPool.length;
    return Math.min(totalQuestions, this.questionPool.length);
  }

  /**
   * Get the current question — configured mode uses index, casual mode uses last used ID.
   */
  private getCurrentQuestion(): QuestionWithMeta | null {
    const state = this.getState();
    if (state.game.config.gameType === 'configured') {
      return this.questionPool[this.currentQuestionIndex] ?? null;
    }
    // Casual mode: find by last used ID
    const usedIds = [...this.usedQuestionIds];
    const lastUsedId = usedIds[this.currentQuestionIndex];
    if (!lastUsedId) return null;
    return this.questionPool.find((q) => q.id === lastUsedId) ?? null;
  }

  /**
   * Show the next question (with optional media preview)
   */
  private showNextQuestion(): void {
    if (this.currentQuestionIndex >= this.totalQuestionCount) {
      this.endGame();
      return;
    }

    const state = this.getState();
    let question: QuestionWithMeta;

    if (state.game.config.gameType === 'configured' && !this.isMetaSet) {
      // Configured mode (non-meta): use authored order
      if (this.currentQuestionIndex >= this.questionPool.length) {
        this.endGame();
        return;
      }
      question = this.questionPool[this.currentQuestionIndex];
    } else {
      // Casual mode: dynamically select from remaining pool
      const remaining = this.questionPool.filter((q) => !this.usedQuestionIds.has(q.id));
      if (remaining.length === 0) {
        this.endGame();
        return;
      }

      const players = this.buildSelectionPlayers();
      if (players.length === 0) {
        // No profiled players — random pick
        question = remaining[Math.floor(Math.random() * remaining.length)];
      } else {
        question = selectNextQuestion(remaining, {
          players,
          playerTagScores: this.playerTagScores,
          roundIndex: this.currentQuestionIndex,
          totalRounds: this.totalQuestionCount,
        });
      }
      this.usedQuestionIds.add(question.id);
    }

    // Compute per-player difficulties for this question
    this.computeRoundDifficulties(question);

    const media = question.media;

    if (media) {
      const previewDuration = media.previewDuration ?? 5;

      const previewPayload = {
        questionNumber: this.currentQuestionIndex + 1,
        totalQuestions: this.totalQuestionCount,
        media: { type: media.type as 'image' | 'audio' | 'video', url: media.url },
        duration: previewDuration,
      };

      this.store.dispatch(showMediaPreview(previewPayload));
      wsServer.broadcast({ type: 'MEDIA_PREVIEW', payload: previewPayload });

      this.mediaPreviewTimeout = setTimeout(() => {
        this.mediaPreviewTimeout = null;
        this.sendQuestion(question);
      }, previewDuration * 1000);
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
   * Send the actual question (after optional media preview)
   */
  private sendQuestion(question: QuestionWithMeta): void {
    const state = this.getState();
    const timeLimit = state.game.config.questionTimeLimit;

    const questionPayload = {
      id: question.id,
      text: question.text,
      options: question.options,
      timeLimit,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.totalQuestionCount,
      serverTimestamp: Date.now(),
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

    const playerResults: PlayerResult[] = players.map((player) => {
      const playerAnswer = answers[player.id];
      const isCorrect = playerAnswer?.answer === correctAnswer;
      let responseTimeMs: number | null = null;
      let baseScore = 0;

      if (playerAnswer) {
        responseTimeMs = playerAnswer.serverReceivedAt - this.questionStartTime;
        baseScore = calculateScore(isCorrect, responseTimeMs, timeLimit);
      }

      // Apply difficulty multiplier
      const playerDifficulty =
        this.currentRoundDifficulties.get(player.id) ?? currentQuestion.difficulty ?? 3;
      const multiplier = difficultyMultiplier(playerDifficulty);
      const pointsEarned = Math.round(baseScore * multiplier);

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
        baseScore,
        difficultyMultiplier: multiplier,
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

    this.store.dispatch(showRoundResults({ results: playerResults, rankings }));

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

    // Update tag scores for profiled players (async, don't block gameplay)
    this.updateTagScoresAfterRound(currentQuestion, playerResults).catch((err) =>
      console.error('Failed to update tag scores:', err),
    );

    // Track question usage (fire-and-forget)
    questionsRepo
      .markQuestionAsked(getDb(), currentQuestion.id)
      .catch((err) => console.error('Failed to update question usage:', err));

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

    // Increment games_played on all tag scores for decay tracking
    this.incrementTagGamesPlayed().catch((err) =>
      console.error('Failed to increment tag games played:', err),
    );
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
  configureGame(gameType: 'casual' | 'configured', questionSetId?: string): void {
    this.store.dispatch(updateConfig({ gameType, questionSetId }));

    if (gameType === 'configured' && questionSetId) {
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
      this.isMetaSet = false;
    }
  }

  setLanguage(language: string): void {
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
    this.isMetaSet = false;
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
