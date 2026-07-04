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
  filterOverusedPictureYears,
  filterRecentlyServedQuestions,
  limitPicturesPerAnswerYear,
  MAX_PICTURES_PER_ANSWER_YEAR,
  type PoolBuildContext,
  type RoundSelectionContext,
  type RoundSelectionPlayer,
  type SelectableQuestion,
  selectNextQuestion,
} from './utils/questionSelection';
// Utilities
export {
  BASE_POINTS,
  calculateScore,
  computeCatchUpInfluence,
  computeLifetimeHandicap,
  computeTimeBonusMultiplier,
  getPositionSuffix,
  MAX_TIME_BONUS,
  type PlayerScore,
  type RankedPlayer,
  rankPlayers,
  type ScoreBreakdown,
} from './utils/scoring';
export {
  computeEffectiveDifficulty,
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
