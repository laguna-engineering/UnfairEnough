import type { QuestionOption } from '@unfairenough/ws-protocol';

// ── Row types (match SQLite columns) ─────────────────────────

export interface QuestionSetRow {
  id: string;
  name: string;
  author: string | null;
  description: string | null;
  default_time_limit: number;
  tags: string | null; // JSON array
  question_count: number;
  is_meta: number; // 0 or 1
  deleted_at: string | null; // soft delete
  created_at: string;
  updated_at: string;
}

export interface MetaSetChildRow {
  meta_set_id: string;
  child_set_id: string;
  sort_order: number;
}

export interface QuestionRow {
  id: string;
  set_id: string | null;
  original_id: string | null;
  type: QuestionType;
  text: string;
  category: string | null;
  tags: string | null; // JSON array
  time_limit: number | null;
  media_type: MediaType | null;
  media_url: string | null;
  media_preview_duration: number;
  options: string; // JSON array of {key, text}
  correct_answer: string;
  player_difficulty: string | null; // JSON object
  difficulty: number;
  explanation: string | null;
  hide_tags: number;
  times_asked: number;
  last_asked_at: string | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  device_id: string | null;
  display_name: string;
  avatar_color: string;
  avatar_emoji: string | null;
  source: 'admin' | 'auto';
  created_at: string;
  last_seen_at: string;
  total_games: number;
  total_wins: number;
  total_score: number;
}

export interface GameRow {
  id: string;
  question_set_id: string | null;
  room_code: string;
  game_type: GameType;
  player_count: number;
  question_count: number;
  started_at: string;
  ended_at: string | null;
  winner_player_id: string | null;
  winner_name: string | null;
}

export interface RoundResultRow {
  id: number;
  game_id: string;
  question_id: string;
  round_number: number;
  player_id: string;
  player_name: string;
  answer: string | null;
  is_correct: number; // 0 or 1
  response_time_ms: number | null;
  points_earned: number;
  total_score: number;
  rank: number;
  profile_id: string | null;
}

export interface PlayerTagScoreRow {
  id: string;
  player_id: string;
  tag: string;
  score: number;
  total_correct: number;
  total_incorrect: number;
  games_played: number;
  last_updated: string;
}

// ── Domain types (parsed JSON fields) ────────────────────────

export type QuestionType = 'multiple_choice' | 'true_false';
export type MediaType = 'image' | 'audio' | 'video';
export type GameType = 'casual' | 'configured';

export interface QuestionWithMeta {
  id: string;
  setId: string | null;
  originalId: string | null;
  type: QuestionType;
  text: string;
  category: string | null;
  tags: string[];
  timeLimit: number | null;
  media: {
    type: MediaType;
    url: string;
    previewDuration: number;
  } | null;
  options: QuestionOption[];
  correctAnswer: string;
  playerDifficulty: Record<string, number> | null;
  difficulty: number;
  explanation: string | null;
  hideTags: boolean;
  timesAsked: number;
  lastAskedAt: string | null;
}

export interface QuestionSetWithMeta {
  id: string;
  name: string;
  author: string | null;
  description: string | null;
  defaultTimeLimit: number;
  tags: string[];
  questionCount: number;
  isMeta: boolean;
  childSetIds?: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProfile {
  id: string;
  deviceId: string | null;
  displayName: string;
  avatarColor: string;
  avatarEmoji: string | null;
  source: 'admin' | 'auto';
  createdAt: string;
  lastSeenAt: string;
  totalGames: number;
  totalWins: number;
  totalScore: number;
}

export interface GameSession {
  id: string;
  questionSetId: string | null;
  roomCode: string;
  gameType: GameType;
  playerCount: number;
  questionCount: number;
  startedAt: string;
  endedAt: string | null;
  winnerPlayerId: string | null;
  winnerName: string | null;
}

export interface RoundResultEntry {
  id: number;
  gameId: string;
  questionId: string;
  roundNumber: number;
  playerId: string;
  playerName: string;
  answer: string | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  pointsEarned: number;
  totalScore: number;
  rank: number;
  profileId: string | null;
}

export interface PlayerTagScore {
  id: string;
  playerId: string;
  tag: string;
  score: number;
  totalCorrect: number;
  totalIncorrect: number;
  gamesPlayed: number;
  lastUpdated: string;
}
