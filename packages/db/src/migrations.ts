import type { DbAdapter } from './adapter';

const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -16000;
`;

const MIGRATION_V1 = `
-- Question sets (uploaded packs)
CREATE TABLE IF NOT EXISTS question_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  description TEXT,
  default_time_limit INTEGER NOT NULL DEFAULT 10,
  tags TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual questions
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  set_id TEXT REFERENCES question_sets(id) ON DELETE SET NULL,
  original_id TEXT,
  type TEXT NOT NULL DEFAULT 'multiple_choice',
  text TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  time_limit INTEGER,
  media_type TEXT,
  media_url TEXT,
  media_preview_duration INTEGER DEFAULT 5,
  options TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  player_difficulty TEXT,
  explanation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(original_id, set_id)
);
CREATE INDEX IF NOT EXISTS idx_questions_set_id ON questions(set_id);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);

-- Player profiles
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  device_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_games INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_players_device_id ON players(device_id);

-- Game sessions
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  question_set_id TEXT REFERENCES question_sets(id),
  room_code TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'casual',
  player_count INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  winner_player_id TEXT,
  winner_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_started_at ON games(started_at);

-- Per-round results (for position history)
CREATE TABLE IF NOT EXISTS round_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  answer TEXT,
  is_correct INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  points_earned INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  UNIQUE(game_id, round_number, player_id)
);
CREATE INDEX IF NOT EXISTS idx_round_results_game ON round_results(game_id);
CREATE INDEX IF NOT EXISTS idx_round_results_player ON round_results(player_id);
CREATE INDEX IF NOT EXISTS idx_round_results_game_round ON round_results(game_id, round_number);
`;

const MIGRATION_V2 = `
-- Per-player, per-tag aggregate scores for difficulty personalization
CREATE TABLE IF NOT EXISTS player_tag_scores (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  total_incorrect INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, tag),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_tag_scores_player ON player_tag_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_player_tag_scores_tag ON player_tag_scores(tag);

-- Link round results to persistent player profiles
ALTER TABLE round_results ADD COLUMN profile_id TEXT REFERENCES players(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_round_results_profile ON round_results(profile_id);
`;

const MIGRATION_V3 = `
UPDATE player_tag_scores SET score = 1500 WHERE score <> 1500;
`;

const MIGRATION_V4 = `
ALTER TABLE players ADD COLUMN avatar_emoji TEXT DEFAULT NULL;
ALTER TABLE players ADD COLUMN source TEXT NOT NULL DEFAULT 'auto';
`;

const MIGRATION_V5 = `
ALTER TABLE questions ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 3;
`;

const MIGRATION_V6 = `
ALTER TABLE questions ADD COLUMN times_asked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN last_asked_at TEXT DEFAULT NULL;
`;

const MIGRATION_V7 = `
ALTER TABLE question_sets ADD COLUMN is_meta INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS meta_set_children (
  meta_set_id TEXT NOT NULL REFERENCES question_sets(id),
  child_set_id TEXT NOT NULL REFERENCES question_sets(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meta_set_id, child_set_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_set_children_meta ON meta_set_children(meta_set_id);
CREATE INDEX IF NOT EXISTS idx_meta_set_children_child ON meta_set_children(child_set_id);
`;

interface Migration {
  version: number;
  sql: string;
}

const MIGRATION_V8 = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT,
  room_code TEXT,
  event_type TEXT NOT NULL,
  player_id TEXT,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
`;

const MIGRATION_V9 = `
ALTER TABLE questions ADD COLUMN hide_tags INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_V10 = `
ALTER TABLE question_sets ADD COLUMN available_in_casual INTEGER NOT NULL DEFAULT 1;
`;

const migrations: Migration[] = [
  { version: 1, sql: MIGRATION_V1 },
  { version: 2, sql: MIGRATION_V2 },
  { version: 3, sql: MIGRATION_V3 },
  { version: 4, sql: MIGRATION_V4 },
  { version: 5, sql: MIGRATION_V5 },
  { version: 6, sql: MIGRATION_V6 },
  { version: 7, sql: MIGRATION_V7 },
  { version: 8, sql: MIGRATION_V8 },
  { version: 9, sql: MIGRATION_V9 },
  { version: 10, sql: MIGRATION_V10 },
];

/**
 * Configure PRAGMAs for optimal performance.
 * Must be called on every new connection.
 */
export async function configurePragmas(db: DbAdapter): Promise<void> {
  // PRAGMAs must be executed one at a time
  for (const line of PRAGMAS.trim().split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('--')) {
      await db.exec(trimmed);
    }
  }
}

/**
 * Run pending migrations based on PRAGMA user_version.
 * Idempotent — safe to call on every startup.
 */
export async function runMigrations(db: DbAdapter): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      // Execute migration SQL (multiple statements)
      for (const statement of splitStatements(migration.sql)) {
        await db.exec(statement);
      }
      await db.exec(`PRAGMA user_version = ${migration.version}`);
      currentVersion = migration.version;
    }
  }

  return currentVersion;
}

/**
 * Split a multi-statement SQL string into individual statements.
 * Strips standalone comment lines before splitting.
 */
function splitStatements(sql: string): string[] {
  // Remove full-line comments (but keep inline comments)
  const cleaned = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s};`);
}
