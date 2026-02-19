// Store

// Data
export {
  getRandomQuestions,
  type QuestionWithAnswer,
  sampleQuestions,
} from './data/sampleQuestions';

// Game slice
export {
  type Answer,
  cancelGame,
  default as gameReducer,
  endGame,
  type GameConfig,
  type GamePhase,
  nextQuestion,
  receiveAnswer,
  resetGame,
  setCountdown,
  setServerReady,
  showMediaPreview,
  showQuestion,
  showRoundResults,
  startGameCountdown,
  startRevealing,
  tickGameCountdown,
  tickQuestionTimer,
  updateConfig,
} from './slices/gameSlice';

// Players slice
export {
  addPlayer,
  addPoints,
  clearPlayers,
  default as playersReducer,
  type Player,
  playersSelectors,
  removePlayer,
  resetScores,
  setPlayerConnected,
  updateScore,
} from './slices/playersSlice';
export { type AppDispatch, type AppStore, createStore, type RootState } from './store';
export {
  buildQuestionPool,
  type PoolBuildContext,
  type RoundSelectionContext,
  type RoundSelectionPlayer,
  type SelectableQuestion,
  selectNextQuestion,
} from './utils/questionSelection';
// Utilities
export {
  calculateScore,
  getPositionSuffix,
  type PlayerScore,
  type RankedPlayer,
  rankPlayers,
} from './utils/scoring';
export {
  computePlayerDifficulty,
  computeTagUpdates,
  decayedScore,
  difficultyMultiplier,
  ELO_BASELINE,
  ELO_K,
  ELO_SCALE,
  resolvePlayerDifficulty,
  type TagScoreUpdate,
} from './utils/tagScoring';
