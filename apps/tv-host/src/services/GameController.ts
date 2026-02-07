/**
 * Game Controller
 * Orchestrates the game flow, timing, and scoring
 */

import type { IGameController } from './IGameController';
import { wsServer } from './WebSocketServer';
import { initDatabase, getDb } from './database';
import { questionsRepo, type QuestionWithMeta } from '@unfairenough/db';
import {
  createStore,
  setServerReady,
  startGameCountdown,
  tickGameCountdown,
  showMediaPreview,
  showQuestion,
  tickQuestionTimer,
  receiveAnswer,
  startRevealing,
  showRoundResults,
  nextQuestion,
  endGame,
  resetGame,
  updateConfig,
  addPlayer,
  removePlayer,
  addPoints,
  playersSelectors,
  calculateScore,
  rankPlayers,
  type RootState,
  type QuestionWithAnswer,
} from '@unfairenough/game-logic';
import type { PlayerResult, AnswerKey } from '@unfairenough/ws-protocol';

class GameController implements IGameController {
  private store = createStore();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private questionTimer: ReturnType<typeof setInterval> | null = null;
  private mediaPreviewTimeout: ReturnType<typeof setTimeout> | null = null;
  private revealTimeout: ReturnType<typeof setTimeout> | null = null;
  private resultsTimeout: ReturnType<typeof setTimeout> | null = null;
  private questions: QuestionWithAnswer[] = [];
  private currentQuestionIndex = 0;
  private questionStartTime = 0;

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
          })
        );
      },
      onPlayerLeft: (data) => {
        this.store.dispatch(removePlayer(data.playerId));
      },
      onAnswerReceived: (data) => {
        this.handleAnswer(data);
      },
    });
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

    // Load questions from DB, then start countdown
    this.loadQuestions().then((questions) => {
      this.questions = questions;
      this.currentQuestionIndex = 0;

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
    }).catch((err) => {
      console.error('Failed to load questions:', err);
    });
  }

  /**
   * Load questions from the local SQLite database.
   */
  private async loadQuestions(): Promise<QuestionWithAnswer[]> {
    const db = getDb();
    const state = this.getState();
    const { gameType, questionSetId, totalQuestions } = state.game.config;

    let dbQuestions: QuestionWithMeta[];

    if (gameType === 'configured' && questionSetId) {
      dbQuestions = await questionsRepo.getQuestionsBySet(db, questionSetId);
    } else {
      dbQuestions = await questionsRepo.getRandomQuestions(db, totalQuestions);
    }

    return dbQuestions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      correctAnswer: q.correctAnswer as AnswerKey,
      media: q.media ?? undefined,
    }));
  }

  /**
   * Show the next question (with optional media preview)
   */
  private showNextQuestion(): void {
    if (this.currentQuestionIndex >= this.questions.length) {
      this.endGame();
      return;
    }

    const question = this.questions[this.currentQuestionIndex];
    const media = question.media;

    if (media) {
      const previewDuration = media.previewDuration ?? 5;

      const previewPayload = {
        questionNumber: this.currentQuestionIndex + 1,
        totalQuestions: this.questions.length,
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
   * Send the actual question (after optional media preview)
   */
  private sendQuestion(question: QuestionWithAnswer): void {
    const state = this.getState();
    const timeLimit = state.game.config.questionTimeLimit;

    const questionPayload = {
      id: question.id,
      text: question.text,
      options: question.options,
      timeLimit,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
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
        // Check if all players answered
        const totalPlayers = playersSelectors.selectTotal(newState.players);
        const answeredCount = Object.keys(newState.game.answers).length;
        if (answeredCount >= totalPlayers && totalPlayers > 0) {
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
      })
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
   * Calculate and show round results
   */
  private showRoundResults(): void {
    const state = this.getState();
    const currentQuestion = this.questions[this.currentQuestionIndex];
    const correctAnswer = currentQuestion.correctAnswer;
    const timeLimit = state.game.config.questionTimeLimit;

    const players = playersSelectors.selectAll(state.players);
    const answers = state.game.answers;

    const playerResults: PlayerResult[] = players.map((player) => {
      const playerAnswer = answers[player.id];
      const isCorrect = playerAnswer?.answer === correctAnswer;
      let responseTimeMs: number | null = null;
      let pointsEarned = 0;

      if (playerAnswer) {
        responseTimeMs = playerAnswer.serverReceivedAt - this.questionStartTime;
        pointsEarned = calculateScore(isCorrect, responseTimeMs, timeLimit);
      }

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
        pointsEarned,
        totalScore: updatedPlayer?.score ?? player.score,
      };
    });

    // Compute rankings
    const updatedState = this.getState();
    const updatedPlayers = playersSelectors.selectAll(updatedState.players);
    const rankings = rankPlayers(
      updatedPlayers.map((p) => ({ id: p.id, name: p.name, score: p.score }))
    ).map((r) => ({
      playerId: r.id,
      name: r.name,
      score: r.score,
      rank: r.rank,
    }));

    this.store.dispatch(showRoundResults({ results: playerResults, rankings }));

    // Broadcast results
    wsServer.broadcast({
      type: 'ROUND_END',
      payload: {
        questionId: currentQuestion.id,
        correctAnswer,
        playerResults,
        rankings,
      },
    });

    // Move to next question after showing results
    this.resultsTimeout = setTimeout(() => {
      this.resultsTimeout = null;
      this.currentQuestionIndex++;
      if (this.currentQuestionIndex < this.questions.length) {
        this.store.dispatch(nextQuestion());
        this.showNextQuestion();
      } else {
        this.endGame();
      }
    }, 5000);
  }

  /**
   * End the game and show final results
   */
  private endGame(): void {
    this.store.dispatch(endGame());

    const state = this.getState();
    const players = playersSelectors.selectAll(state.players);
    const rankings = rankPlayers(
      players.map((p) => ({ id: p.id, name: p.name, score: p.score }))
    );

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
  }

  /**
   * Configure game mode
   */
  configureGame(gameType: 'casual' | 'configured', questionSetId?: string): void {
    this.store.dispatch(updateConfig({ gameType, questionSetId }));

    if (gameType === 'configured' && questionSetId) {
      // Validate the set exists and has questions
      const db = getDb();
      questionsRepo.getQuestionSet(db, questionSetId).then((set) => {
        if (!set || set.questionCount === 0) {
          console.warn('Question set not found or empty:', questionSetId);
          this.store.dispatch(updateConfig({ gameType: 'casual', questionSetId: undefined }));
        } else {
          this.store.dispatch(updateConfig({ totalQuestions: set.questionCount }));
        }
      }).catch((err) => {
        console.error('Failed to validate question set:', err);
      });
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
    this.questions = [];
    this.currentQuestionIndex = 0;
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
