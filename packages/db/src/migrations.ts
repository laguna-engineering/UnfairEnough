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

const MIGRATION_V11 = `
ALTER TABLE question_sets ADD COLUMN language TEXT NOT NULL DEFAULT 'it';
ALTER TABLE questions ADD COLUMN language TEXT NOT NULL DEFAULT 'it';
CREATE INDEX IF NOT EXISTS idx_questions_language ON questions(language);
`;

const MIGRATION_V12 = `
ALTER TABLE games ADD COLUMN question_set_ids TEXT;
`;

const MIGRATION_V13 = `
CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  type TEXT NOT NULL DEFAULT 'host_admin',
  device_id TEXT,
  device_info TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_host ON sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

`;

const MIGRATION_V14 = `
ALTER TABLE question_sets ADD COLUMN host_id TEXT REFERENCES hosts(id);
ALTER TABLE games ADD COLUMN host_id TEXT REFERENCES hosts(id);
ALTER TABLE events ADD COLUMN host_id TEXT REFERENCES hosts(id);

CREATE INDEX IF NOT EXISTS idx_question_sets_host ON question_sets(host_id);
CREATE INDEX IF NOT EXISTS idx_games_host ON games(host_id);
CREATE INDEX IF NOT EXISTS idx_events_host ON events(host_id);
`;

/**
 * V15: Rebuild `players` table to remove the V1 column-level UNIQUE on device_id.
 * The old UNIQUE prevents the same device from having profiles under different hosts.
 * We replace it with partial unique indexes that scope by host_id.
 *
 * Also rebuilds `player_tag_scores` to add host_id to the UNIQUE constraint.
 *
 * IMPORTANT: This migration disables foreign keys during the rebuild.
 * The runMigrations function handles this specially (see `needsFkOff`).
 */
const MIGRATION_V15_FK_OFF = `
CREATE TABLE players_new (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  host_id TEXT REFERENCES hosts(id),
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_games INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0
);

INSERT INTO players_new (id, device_id, host_id, display_name, avatar_color, avatar_emoji, source, created_at, last_seen_at, total_games, total_wins, total_score)
  SELECT id, device_id, NULL, display_name, avatar_color, avatar_emoji, source, created_at, last_seen_at, total_games, total_wins, total_score FROM players;

DROP TABLE players;
ALTER TABLE players_new RENAME TO players;

CREATE UNIQUE INDEX idx_players_device_unscoped ON players(device_id) WHERE host_id IS NULL AND device_id IS NOT NULL;
CREATE UNIQUE INDEX idx_players_host_device ON players(host_id, device_id) WHERE host_id IS NOT NULL AND device_id IS NOT NULL;
CREATE INDEX idx_players_host ON players(host_id);
CREATE INDEX idx_players_device_id ON players(device_id);

CREATE TABLE player_tag_scores_new (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  total_incorrect INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  host_id TEXT REFERENCES hosts(id),
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, tag, host_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

INSERT INTO player_tag_scores_new (id, player_id, tag, score, total_correct, total_incorrect, games_played, host_id, last_updated)
  SELECT id, player_id, tag, score, total_correct, total_incorrect, games_played, NULL, last_updated FROM player_tag_scores;

DROP TABLE player_tag_scores;
ALTER TABLE player_tag_scores_new RENAME TO player_tag_scores;

CREATE INDEX idx_player_tag_scores_player ON player_tag_scores(player_id);
CREATE INDEX idx_player_tag_scores_tag ON player_tag_scores(tag);
CREATE INDEX idx_player_tag_scores_host ON player_tag_scores(host_id);
`;

/**
 * V16: TV device-flow invitation tokens. Used to build the player-join QR and
 * to link returning guests to a host's active room. The invitationTokens repo
 * and routes/auth.ts reference this table, but no prior migration created it —
 * so device-flow room creation (and room teardown) threw "no such table".
 */
const MIGRATION_V16 = `
CREATE TABLE IF NOT EXISTS invitation_tokens (
  token_hash TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  room_code TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_room ON invitation_tokens(room_code);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_host ON invitation_tokens(host_id);
`;

interface Migration {
  version: number;
  sql: string;
  /** If true, PRAGMA foreign_keys is disabled during this migration (for table rebuilds). */
  needsFkOff?: boolean;
}

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
  { version: 11, sql: MIGRATION_V11 },
  { version: 12, sql: MIGRATION_V12 },
  { version: 13, sql: MIGRATION_V13 },
  { version: 14, sql: MIGRATION_V14 },
  { version: 15, sql: MIGRATION_V15_FK_OFF, needsFkOff: true },
  { version: 16, sql: MIGRATION_V16 },
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
      if (migration.needsFkOff) {
        // Table-rebuild migrations need FK checks disabled.
        // PRAGMA foreign_keys cannot be changed inside a transaction.
        await db.exec('PRAGMA foreign_keys = OFF');
        await db.exec('BEGIN');
        try {
          // Snapshot row counts for verification
          const playersBefore = await db.get<{ cnt: number }>(
            'SELECT COUNT(*) as cnt FROM players',
          );
          const tagsBefore = await db.get<{ cnt: number }>(
            'SELECT COUNT(*) as cnt FROM player_tag_scores',
          );

          for (const statement of splitStatements(migration.sql)) {
            await db.exec(statement);
          }

          // Verify row counts match after rebuild
          const playersAfter = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM players');
          const tagsAfter = await db.get<{ cnt: number }>(
            'SELECT COUNT(*) as cnt FROM player_tag_scores',
          );
          if (playersBefore!.cnt !== playersAfter!.cnt) {
            throw new Error(
              `Player count mismatch: ${playersBefore!.cnt} before, ${playersAfter!.cnt} after`,
            );
          }
          if (tagsBefore!.cnt !== tagsAfter!.cnt) {
            throw new Error(
              `Tag score count mismatch: ${tagsBefore!.cnt} before, ${tagsAfter!.cnt} after`,
            );
          }

          await db.exec(`PRAGMA user_version = ${migration.version}`);
          await db.exec('COMMIT');
        } catch (err) {
          await db.exec('ROLLBACK');
          await db.exec('PRAGMA foreign_keys = ON');
          throw err;
        }
        await db.exec('PRAGMA foreign_keys = ON');

        // Verify FK integrity after rebuild
        const fkErrors = await db.all<{ table: string }>('PRAGMA foreign_key_check');
        if (fkErrors.length > 0) {
          throw new Error(
            `Foreign key violations after V${migration.version}: ${JSON.stringify(fkErrors)}`,
          );
        }
      } else {
        // Standard migration — wrap in a transaction
        await db.exec('BEGIN');
        try {
          for (const statement of splitStatements(migration.sql)) {
            await db.exec(statement);
          }
          await db.exec(`PRAGMA user_version = ${migration.version}`);
          await db.exec('COMMIT');
        } catch (err) {
          await db.exec('ROLLBACK');
          throw err;
        }
      }
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
