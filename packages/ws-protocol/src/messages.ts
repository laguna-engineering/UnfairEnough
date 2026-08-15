// Client -> Server messages
export type ClientMessage =
  | {
      type: 'JOIN';
      payload: { name: string; roomCode?: string; deviceId?: string; profileId?: string };
    }
  | {
      type: 'IDENTIFY';
      payload: { deviceId: string; sessionToken?: string; invitationToken?: string };
    }
  | { type: 'UNBIND'; payload: { deviceId: string } }
  | { type: 'RECONNECT'; payload: { playerId: string } }
  | { type: 'ANSWER'; payload: AnswerPayload }
  | { type: 'LEAVE' }
  | { type: 'PING' };

// Server -> Client messages
export type ServerMessage =
  | { type: 'WELCOME'; payload: WelcomePayload }
  | { type: 'IDENTITY'; payload: IdentityPayload }
  | { type: 'ROOM_CREATED'; payload: { roomCode: string; invitationToken?: string } }
  | { type: 'PLAYER_JOINED'; payload: PlayerInfo }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'PLAYER_DISCONNECTED'; payload: { playerId: string } }
  | { type: 'PLAYER_RECONNECTED'; payload: { playerId: string } }
  | { type: 'GAME_STARTING'; payload: { countdown: number } }
  | { type: 'QUESTION'; payload: Question & { serverTimestamp: number } }
  | { type: 'TICK'; payload: { remaining: number } }
  | {
      type: 'ANSWER_ACK';
      payload: {
        questionId: string;
        serverReceivedAt: number;
        /** Which AnswerPayload field this ack confirms. Absent = legacy `answer`. */
        field?: 'answer' | 'guess' | 'vote' | 'prediction';
      };
    }
  | {
      type: 'PLAYER_ANSWERED';
      payload: {
        playerId: string;
        questionId: string;
        /** Which AnswerPayload field the player submitted. Absent = legacy `answer`. */
        kind?: 'answer' | 'guess' | 'vote' | 'prediction';
      };
    }
  | { type: 'MEDIA_PREVIEW'; payload: MediaPreviewPayload }
  | { type: 'MEDIA_PRELOAD'; payload: MediaPreloadPayload }
  | { type: 'REVEALING' }
  | { type: 'ROUND_END'; payload: RoundResult }
  | { type: 'GAME_OVER'; payload: GameResult }
  | { type: 'STATE_SNAPSHOT'; payload: StateSnapshotPayload }
  | {
      type: 'GAME_CONFIGURED';
      payload: {
        gameType: string;
        questionCount: number;
        questionSetId?: string;
        tags?: string[];
        adaptiveMode?: boolean;
      };
    }
  | { type: 'PONG' }
  | { type: 'ERROR'; payload: { code: string; message: string } }
  | {
      type: 'AUTH_CHALLENGE';
      payload: { userCode: string; verificationUrl: string; expiresIn: number };
    }
  | { type: 'AUTH_SUCCESS'; payload: { sessionToken: string; hostId: string; displayName: string } }
  | { type: 'AUTH_FAILED'; payload: { reason: string } }
  | { type: 'AUTH_EXPIRED' };

// Shared types
export type AnswerKey = 'A' | 'B' | 'C' | 'D';

/**
 * The four question shapes: `multiple_choice` (existing 2-4 option question),
 * `true_false` and 2-option `multiple_choice` ("this or that", rendering-only
 * distinction — both use the 2-option tile layout), `closest_wins` (numeric
 * estimation), and `predict_room` (opinion poll + prediction).
 */
export type QuestionType = 'multiple_choice' | 'true_false' | 'closest_wins' | 'predict_room';

/**
 * ANSWER message payload. Exactly one of `answer`/`guess`/`vote`/`prediction` is
 * set per message, chosen by the active question's `type`:
 * - `answer` — choice types (multiple_choice, true_false).
 * - `guess` — closest_wins (a numeric estimate).
 * - `vote` then `prediction` — predict_room, sent as two separate ANSWER messages
 *   (vote first, then prediction); either may be missing if the timer expires
 *   before the player sends it.
 */
export interface AnswerPayload {
  questionId: string;
  answer?: AnswerKey;
  guess?: number;
  vote?: AnswerKey;
  prediction?: AnswerKey;
}

export interface WelcomePayload {
  playerId: string;
  playerColor: string;
  roomCode: string;
  language?: string;
  profile?: {
    displayName: string;
    totalGames: number;
    totalWins: number;
  };
}

export interface ProfileSummary {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarEmoji: string;
  totalGames: number;
}

export interface IdentityPayload {
  profile: {
    displayName: string;
    totalGames: number;
    totalWins: number;
  } | null;
  availableProfiles?: ProfileSummary[];
  guestSessionToken?: string;
  serverUrl?: string;
}

export interface PlayerInfo {
  playerId: string;
  name: string;
  color: string;
  emoji?: string;
}

export interface QuestionOption {
  key: AnswerKey;
  text: string;
}

/**
 * Authored audio behavior for a question (KTD1). Orthogonal to `media` (the
 * image): `play` picks the phase the clip sounds in and `role` picks whether
 * the clip is the subject of the question (scored) or ambient background.
 * `preview` implies `subject` (a preview clip is always the subject).
 */
export interface QuestionAudio {
  url: string;
  play: 'preview' | 'question';
  role: 'subject' | 'background';
  duration?: number;
}

export interface Question {
  id: string;
  text: string;
  type?: QuestionType;
  options: QuestionOption[];
  timeLimit: number;
  questionNumber: number;
  totalQuestions: number;
  tags?: string[];
  media?: {
    type: 'image' | 'audio' | 'video';
    url: string;
    previewDuration: number;
  };
  audio?: QuestionAudio;
  /** closest_wins only: the guessable bounds for the numeric estimate. */
  range?: { min: number; max: number; step?: number };
}

export interface MediaPreviewPayload {
  questionId?: string;
  questionNumber: number;
  totalQuestions: number;
  /** The image to show during preview. Absent for audio-only (listen-first) previews. */
  media?: { type: 'image' | 'audio' | 'video'; url: string };
  /** Listen-first audio to play during preview, if any. */
  audio?: QuestionAudio;
  duration: number;
}

/**
 * Server→host one-question lookahead (KTD2): ask the TV to warm the *next*
 * question's media during the current question so playback never stalls between
 * questions. `questionId` correlates the ack. Sent only to the host; players
 * never prefetch.
 */
export interface MediaPreloadPayload {
  questionId: string;
  /** Absolute or server-relative image URL to prefetch, if the next question has one. */
  image?: string;
  /** Absolute or server-relative audio URL to warm, if the next question has one. */
  audio?: string;
}

export interface PlayerResult {
  playerId: string;
  name: string;
  answer: AnswerKey | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  baseScore: number;
  difficultyMultiplier: number;
  timeBonusMultiplier?: number;
  lifetimeHandicap?: number;
  pointsEarned: number;
  totalScore: number;
  difficulty?: number;
  /** closest_wins: this player's submitted guess, if they locked one in. */
  guess?: number | null;
  /** closest_wins: normalized distance from the correct value (0 = exact). */
  distance?: number;
  /** closest_wins: whether this player's guess was the single closest. */
  isClosest?: boolean;
  /** predict_room: this player's prediction of the winning option. */
  prediction?: AnswerKey | null;
  /** predict_room: whether the prediction matched a winning option. */
  predictedCorrectly?: boolean;
  // NOTE: no per-player vote field — predict_room votes are anonymous by
  // design (R13/AE) and must never be broadcast to individual players.
}

export interface RoundResult {
  questionId: string;
  /** null for closest_wins/predict_room, which have no single correct choice. */
  correctAnswer: AnswerKey | null;
  tags?: string[];
  questionDifficulty?: number;
  playerResults: PlayerResult[];
  rankings?: PlayerRanking[];
  questionType?: QuestionType;
  /** closest_wins: the authored correct numeric value. */
  correctValue?: number;
  /** predict_room: aggregate vote counts only — individual votes stay anonymous. */
  voteCounts?: Partial<Record<AnswerKey, number>>;
  /** predict_room: all options tied for the most votes (plural — ties are possible). */
  winningOptions?: AnswerKey[];
}

export interface PlayerRanking {
  playerId: string;
  name: string;
  score: number;
  rank: number;
}

export interface PositionSnapshot {
  round: number;
  positions: { playerId: string; name: string; rank: number; score: number }[];
}

export interface GameResult {
  rankings: PlayerRanking[];
  winner: { playerId: string; name: string; score: number };
  positionHistory?: PositionSnapshot[];
}

/**
 * Full current-phase state, sent to a player when they reconnect so the client
 * can render the live phase atomically instead of falling back to the lobby
 * screen. Only the fields relevant to `phase` are populated.
 */
export interface StateSnapshotPayload {
  phase:
    | 'LOBBY'
    | 'COUNTDOWN'
    | 'MEDIA_PREVIEW'
    | 'QUESTION'
    | 'REVEALING'
    | 'RESULTS'
    | 'GAME_OVER';
  /** COUNTDOWN: whole seconds remaining. */
  countdown?: number;
  /** MEDIA_PREVIEW: the media preview to show. */
  mediaPreview?: MediaPreviewPayload;
  /** QUESTION/REVEALING: the active question (`timeLimit` is the remaining time). */
  question?: Question & { serverTimestamp: number };
  /**
   * QUESTION/REVEALING: whether this player has already submitted everything
   * the active question needs (for predict_room, both vote and prediction).
   */
  hasAnswered?: boolean;
  /** QUESTION/REVEALING: this player's answer, if already submitted (choice types). */
  yourAnswer?: AnswerKey;
  /** QUESTION/REVEALING, closest_wins: this player's own submitted guess, if any. */
  yourGuess?: number;
  /** QUESTION/REVEALING, predict_room: this player's own vote, if any (sent only to its owner — never broadcast). */
  yourVote?: AnswerKey;
  /** QUESTION/REVEALING, predict_room: this player's own prediction, if any. */
  yourPrediction?: AnswerKey;
  /** RESULTS: the last round's result. */
  roundResult?: RoundResult;
  /** GAME_OVER: the final standings. */
  gameResult?: GameResult;
}

// Host -> Server messages
export type HostMessage =
  | { type: 'START_GAME' }
  | { type: 'RESET_GAME' }
  | { type: 'SET_LANGUAGE'; payload: { language: string } }
  | { type: 'CONFIGURE_GAME'; payload: ConfigureGamePayload }
  | { type: 'MEDIA_LOADED'; payload?: { success: boolean; questionId?: string } }
  | { type: 'MEDIA_PRELOADED'; payload: { success: boolean; questionId: string } }
  | { type: 'REQUEST_AUTH' }
  | { type: 'PING' };

export interface ConfigureGamePayload {
  gameType: 'casual' | 'configured' | 'personalized';
  questionSetId?: string; // configured mode (single set)
  tags?: string[]; // personalized mode (union tag selection)
  totalQuestions?: number;
  questionTimeLimit?: number;
  adaptiveMode?: boolean;
}

// Internal messages for RN Bridge communication
export type BridgeMessage =
  | { type: 'SERVER_READY'; port: number; localIp: string; roomCode: string }
  | { type: 'PLAYER_JOINED'; playerId: string; name: string; color: string }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'PLAYER_DISCONNECTED'; playerId: string }
  | { type: 'PLAYER_RECONNECTED'; playerId: string }
  | {
      type: 'ANSWER';
      playerId: string;
      questionId: string;
      answer: AnswerKey;
      serverReceivedAt: number;
    };
