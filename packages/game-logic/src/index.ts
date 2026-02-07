// Store
export { createStore, type AppStore, type RootState, type AppDispatch } from './store';

// Game slice
export {
  default as gameReducer,
  setServerReady,
  startGameCountdown,
  setCountdown,
  showMediaPreview,
  tickGameCountdown,
  showQuestion,
  tickQuestionTimer,
  receiveAnswer,
  startRevealing,
  showRoundResults,
  nextQuestion,
  endGame,
  resetGame,
  cancelGame,
  updateConfig,
  type GamePhase,
  type Answer,
  type GameConfig,
} from './slices/gameSlice';

// Players slice
export {
  default as playersReducer,
  addPlayer,
  removePlayer,
  updateScore,
  addPoints,
  setPlayerConnected,
  clearPlayers,
  resetScores,
  playersSelectors,
  type Player,
} from './slices/playersSlice';

// Utilities
export {
  calculateScore,
  rankPlayers,
  getPositionSuffix,
  type PlayerScore,
  type RankedPlayer,
} from './utils/scoring';

// Data
export {
  sampleQuestions,
  getRandomQuestions,
  type QuestionWithAnswer,
} from './data/sampleQuestions';
