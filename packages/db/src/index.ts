// Adapters
export { createBunAdapter } from './adapter';
export { createExpoAdapter } from './adapter-expo';
export type { DbAdapter, SqlValue, RunResult } from './adapter';

// Schema types
export type {
  QuestionSetRow,
  QuestionRow,
  PlayerRow,
  GameRow,
  RoundResultRow,
  QuestionWithMeta,
  QuestionSetWithMeta,
  PlayerProfile,
  GameSession,
  RoundResultEntry,
  QuestionType,
  MediaType,
  GameType,
} from './schema';

// Migrations
export { configurePragmas, runMigrations } from './migrations';

// Repositories
export * as questionsRepo from './repositories/questions';
export * as playersRepo from './repositories/players';
export * as gamesRepo from './repositories/games';

// Import/validation
export { parseQuestionSetYaml } from './import/yaml-parser';
export type { ParseResult } from './import/yaml-parser';
export { validateQuestionSet } from './import/validator';
export type { QuestionSetInput, QuestionInput, QuestionOptionInput, MediaInput } from './import/validator';
