import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  AnswerKey,
  MediaPreviewPayload,
  PlayerRanking,
  PlayerResult,
  PositionSnapshot,
  Question,
  QuestionAudio,
  QuestionType,
} from '@unfairenough/ws-protocol';

// State machine pattern for game phases - prevents invalid transitions
export type GamePhase =
  | 'LOBBY' // -> COUNTDOWN (when host starts)
  | 'COUNTDOWN' // -> QUESTION or MEDIA_PREVIEW (when countdown reaches 0)
  | 'MEDIA_PREVIEW' // -> QUESTION (when preview ends)
  | 'QUESTION' // -> REVEALING (when timer expires or all answered)
  | 'REVEALING' // -> RESULTS (after reveal animation)
  | 'RESULTS' // -> QUESTION, MEDIA_PREVIEW, or GAME_OVER
  | 'GAME_OVER'; // -> LOBBY (when host restarts)

// Valid phase transitions
const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  LOBBY: ['COUNTDOWN'],
  COUNTDOWN: ['QUESTION', 'MEDIA_PREVIEW', 'LOBBY'], // Can cancel back to lobby
  MEDIA_PREVIEW: ['QUESTION'],
  QUESTION: ['REVEALING'],
  REVEALING: ['RESULTS'],
  RESULTS: ['QUESTION', 'MEDIA_PREVIEW', 'GAME_OVER'],
  GAME_OVER: ['LOBBY'],
};

function isValidTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface Answer {
  playerId: string;
  /** Choice types (multiple_choice, true_false). */
  answer?: AnswerKey;
  /** closest_wins: the player's numeric guess. */
  guess?: number;
  serverReceivedAt: number;
}

/**
 * predict_room prediction, tracked separately from `votes` (see GameState.votes)
 * because a player submits both a vote and a prediction, in that order.
 */
export interface Prediction {
  playerId: string;
  prediction: AnswerKey;
  serverReceivedAt: number;
}

export interface GameConfig {
  questionTimeLimit: number;
  totalQuestions: number;
  minPlayers: number;
  gameType?: 'casual' | 'configured' | 'personalized';
  questionSetId?: string;
  tags?: string[];
  adaptiveMode?: boolean;
}

interface GameState {
  phase: GamePhase;
  currentQuestion: (Question & { serverTimestamp: number }) | null;
  mediaPreview: {
    type?: 'image' | 'audio' | 'video';
    url?: string;
    audio?: QuestionAudio;
    questionId?: string;
    questionNumber: number;
    totalQuestions: number;
  } | null;
  questionIndex: number;
  countdown: number;
  answers: Record<string, Answer>;
  /**
   * predict_room votes, keyed by playerId. Kept LOCAL to this TV/host state only —
   * never broadcast per-player (see PlayerResult's no-vote-field note in
   * ws-protocol) — aggregated into `voteCounts` at reveal time.
   */
  votes: Record<string, AnswerKey>;
  /** predict_room predictions, keyed by playerId. Only recorded after the player's own vote. */
  predictions: Record<string, Prediction>;
  roundResults: PlayerResult[];
  correctAnswer: AnswerKey | null;
  /** The just-resolved round's question type, alongside correctAnswer. */
  questionType?: QuestionType;
  /** closest_wins: the authored correct numeric value for the just-resolved round. */
  correctValue?: number;
  /** predict_room: aggregate vote counts for the just-resolved round. */
  voteCounts?: Partial<Record<AnswerKey, number>>;
  /** predict_room: options tied for the most votes in the just-resolved round. */
  winningOptions?: AnswerKey[];
  roundTags: string[];
  rankings: PlayerRanking[];
  positionHistory: PositionSnapshot[];
  config: GameConfig;
  roomCode: string | null;
  serverPort: number | null;
  localIp: string | null;
  // Last game-configuration error (e.g. no questions for the selected tags),
  // surfaced in the lobby so a rejected config fails visibly instead of silently.
  configError: string | null;
}

const initialState: GameState = {
  phase: 'LOBBY',
  currentQuestion: null,
  mediaPreview: null,
  questionIndex: 0,
  countdown: 0,
  answers: {},
  votes: {},
  predictions: {},
  roundResults: [],
  correctAnswer: null,
  roundTags: [],
  rankings: [],
  positionHistory: [],
  config: {
    questionTimeLimit: 10,
    totalQuestions: 10,
    minPlayers: 1,
  },
  roomCode: null,
  serverPort: null,
  localIp: null,
  configError: null,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setServerReady(
      state,
      action: PayloadAction<{ port: number; localIp: string; roomCode: string }>,
    ) {
      state.serverPort = action.payload.port;
      state.localIp = action.payload.localIp;
      state.roomCode = action.payload.roomCode;
    },

    startGameCountdown(state) {
      if (!isValidTransition(state.phase, 'COUNTDOWN')) return;
      state.phase = 'COUNTDOWN';
      state.countdown = 3;
      state.questionIndex = 0;
    },

    showMediaPreview(state, action: PayloadAction<MediaPreviewPayload>) {
      if (!isValidTransition(state.phase, 'MEDIA_PREVIEW')) return;
      state.phase = 'MEDIA_PREVIEW';
      state.countdown = action.payload.duration;
      state.mediaPreview = {
        ...action.payload.media,
        audio: action.payload.audio,
        questionId: action.payload.questionId,
        questionNumber: action.payload.questionNumber,
        totalQuestions: action.payload.totalQuestions,
      };
    },

    showQuestion(state, action: PayloadAction<Question & { serverTimestamp: number }>) {
      if (!isValidTransition(state.phase, 'QUESTION')) return;
      state.phase = 'QUESTION';
      state.currentQuestion = action.payload;
      state.mediaPreview = null;
      state.countdown = action.payload.timeLimit;
      state.answers = {};
      state.votes = {};
      state.predictions = {};
    },

    setCountdown(state, action: PayloadAction<number>) {
      state.countdown = Math.max(0, action.payload);
    },

    tickGameCountdown(state) {
      state.countdown = Math.max(0, state.countdown - 1);
    },

    tickQuestionTimer(state) {
      state.countdown = Math.max(0, state.countdown - 1);
    },

    receiveAnswer(state, action: PayloadAction<Answer>) {
      const { playerId, answer, guess, serverReceivedAt } = action.payload;
      // Only accept first answer/guess from each player
      if (!state.answers[playerId] && state.phase === 'QUESTION') {
        state.answers[playerId] = { playerId, answer, guess, serverReceivedAt };
      }
    },

    /** predict_room: a player's vote. Only the first vote per player counts. */
    receiveVote(state, action: PayloadAction<{ playerId: string; vote: AnswerKey }>) {
      const { playerId, vote } = action.payload;
      if (!state.votes[playerId] && state.phase === 'QUESTION') {
        state.votes[playerId] = vote;
      }
    },

    /**
     * predict_room: a player's prediction. Only accepted after the player has
     * already voted (R11 ordering), and only the first prediction counts.
     */
    receivePrediction(
      state,
      action: PayloadAction<{ playerId: string; prediction: AnswerKey; serverReceivedAt: number }>,
    ) {
      const { playerId, prediction, serverReceivedAt } = action.payload;
      if (state.votes[playerId] && !state.predictions[playerId] && state.phase === 'QUESTION') {
        state.predictions[playerId] = { playerId, prediction, serverReceivedAt };
      }
    },

    startRevealing(state) {
      if (!isValidTransition(state.phase, 'REVEALING')) return;
      state.phase = 'REVEALING';
    },

    showRoundResults(
      state,
      action: PayloadAction<{
        results: PlayerResult[];
        rankings: PlayerRanking[];
        correctAnswer: AnswerKey | null;
        tags?: string[];
        questionType?: QuestionType;
        correctValue?: number;
        voteCounts?: Partial<Record<AnswerKey, number>>;
        winningOptions?: AnswerKey[];
      }>,
    ) {
      if (!isValidTransition(state.phase, 'RESULTS')) return;
      state.phase = 'RESULTS';
      state.roundResults = action.payload.results;
      state.correctAnswer = action.payload.correctAnswer;
      state.questionType = action.payload.questionType;
      state.correctValue = action.payload.correctValue;
      state.voteCounts = action.payload.voteCounts;
      state.winningOptions = action.payload.winningOptions;
      state.roundTags = action.payload.tags ?? [];
      state.rankings = action.payload.rankings;
      state.positionHistory.push({
        round: state.questionIndex + 1,
        positions: action.payload.rankings.map((r) => ({
          playerId: r.playerId,
          name: r.name,
          rank: r.rank,
          score: r.score,
        })),
      });
    },

    nextQuestion(state) {
      if (state.phase !== 'RESULTS') return;
      state.questionIndex += 1;
      state.roundResults = [];
      state.correctAnswer = null;
      state.questionType = undefined;
      state.correctValue = undefined;
      state.voteCounts = undefined;
      state.winningOptions = undefined;
      state.roundTags = [];
      // Phase stays at RESULTS — showQuestion or showMediaPreview will handle the transition
      // Keep rankings (last round's) and positionHistory (cumulative)
    },

    endGame(state) {
      if (!isValidTransition(state.phase, 'GAME_OVER')) return;
      state.phase = 'GAME_OVER';
    },

    resetGame(state) {
      return {
        ...initialState,
        config: state.config,
        roomCode: state.roomCode,
        serverPort: state.serverPort,
        localIp: state.localIp,
      };
    },

    cancelGame(state) {
      state.phase = 'LOBBY';
      state.currentQuestion = null;
      state.questionIndex = 0;
      state.countdown = 0;
      state.answers = {};
      state.votes = {};
      state.predictions = {};
      state.roundResults = [];
      state.correctAnswer = null;
      state.questionType = undefined;
      state.correctValue = undefined;
      state.voteCounts = undefined;
      state.winningOptions = undefined;
      state.roundTags = [];
      state.rankings = [];
      state.positionHistory = [];
    },

    updateConfig(state, action: PayloadAction<Partial<GameConfig>>) {
      state.config = { ...state.config, ...action.payload };
      // A successful (re)configuration clears any prior config error.
      state.configError = null;
    },

    setConfigError(state, action: PayloadAction<string | null>) {
      state.configError = action.payload;
    },
  },
});

export const {
  setServerReady,
  startGameCountdown,
  setCountdown,
  showMediaPreview,
  showQuestion,
  tickGameCountdown,
  tickQuestionTimer,
  receiveAnswer,
  startRevealing,
  showRoundResults,
  nextQuestion,
  endGame,
  resetGame,
  cancelGame,
  updateConfig,
  setConfigError,
  receiveVote,
  receivePrediction,
} = gameSlice.actions;

export default gameSlice.reducer;
