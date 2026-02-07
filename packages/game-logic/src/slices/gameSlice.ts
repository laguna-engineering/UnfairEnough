import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Question, PlayerResult, PlayerRanking, PositionSnapshot, AnswerKey, MediaPreviewPayload } from '@unfairenough/ws-protocol';

// State machine pattern for game phases - prevents invalid transitions
export type GamePhase =
  | 'LOBBY'          // -> COUNTDOWN (when host starts)
  | 'COUNTDOWN'      // -> QUESTION or MEDIA_PREVIEW (when countdown reaches 0)
  | 'MEDIA_PREVIEW'  // -> QUESTION (when preview ends)
  | 'QUESTION'       // -> REVEALING (when timer expires or all answered)
  | 'REVEALING'      // -> RESULTS (after reveal animation)
  | 'RESULTS'        // -> QUESTION, MEDIA_PREVIEW, or GAME_OVER
  | 'GAME_OVER';     // -> LOBBY (when host restarts)

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
  answer: AnswerKey;
  serverReceivedAt: number;
}

export interface GameConfig {
  questionTimeLimit: number;
  totalQuestions: number;
  minPlayers: number;
  gameType?: 'casual' | 'configured';
  questionSetId?: string;
}

interface GameState {
  phase: GamePhase;
  currentQuestion: (Question & { serverTimestamp: number }) | null;
  questionIndex: number;
  countdown: number;
  answers: Record<string, Answer>;
  roundResults: PlayerResult[];
  rankings: PlayerRanking[];
  positionHistory: PositionSnapshot[];
  config: GameConfig;
  roomCode: string | null;
  serverPort: number | null;
  localIp: string | null;
}

const initialState: GameState = {
  phase: 'LOBBY',
  currentQuestion: null,
  questionIndex: 0,
  countdown: 0,
  answers: {},
  roundResults: [],
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
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setServerReady(state, action: PayloadAction<{ port: number; localIp: string; roomCode: string }>) {
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
    },

    showQuestion(state, action: PayloadAction<Question & { serverTimestamp: number }>) {
      if (!isValidTransition(state.phase, 'QUESTION')) return;
      state.phase = 'QUESTION';
      state.currentQuestion = action.payload;
      state.countdown = action.payload.timeLimit;
      state.answers = {};
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
      const { playerId, answer, serverReceivedAt } = action.payload;
      // Only accept first answer from each player
      if (!state.answers[playerId] && state.phase === 'QUESTION') {
        state.answers[playerId] = { playerId, answer, serverReceivedAt };
      }
    },

    startRevealing(state) {
      if (!isValidTransition(state.phase, 'REVEALING')) return;
      state.phase = 'REVEALING';
    },

    showRoundResults(state, action: PayloadAction<{ results: PlayerResult[]; rankings: PlayerRanking[] }>) {
      if (!isValidTransition(state.phase, 'RESULTS')) return;
      state.phase = 'RESULTS';
      state.roundResults = action.payload.results;
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
      state.roundResults = [];
      state.rankings = [];
      state.positionHistory = [];
    },

    updateConfig(state, action: PayloadAction<Partial<GameConfig>>) {
      state.config = { ...state.config, ...action.payload };
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
} = gameSlice.actions;

export default gameSlice.reducer;
