// Client -> Server messages
export type ClientMessage =
  | { type: 'JOIN'; payload: { name: string; roomCode?: string; deviceId?: string } }
  | { type: 'IDENTIFY'; payload: { deviceId: string } }
  | { type: 'RECONNECT'; payload: { playerId: string } }
  | { type: 'ANSWER'; payload: { questionId: string; answer: AnswerKey } }
  | { type: 'LEAVE' }
  | { type: 'PING' };

// Server -> Client messages
export type ServerMessage =
  | { type: 'WELCOME'; payload: WelcomePayload }
  | { type: 'IDENTITY'; payload: IdentityPayload }
  | { type: 'ROOM_CREATED'; payload: { roomCode: string } }
  | { type: 'PLAYER_JOINED'; payload: PlayerInfo }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string } }
  | { type: 'PLAYER_DISCONNECTED'; payload: { playerId: string } }
  | { type: 'PLAYER_RECONNECTED'; payload: { playerId: string } }
  | { type: 'GAME_STARTING'; payload: { countdown: number } }
  | { type: 'QUESTION'; payload: Question & { serverTimestamp: number } }
  | { type: 'TICK'; payload: { remaining: number } }
  | { type: 'ANSWER_ACK'; payload: { questionId: string; serverReceivedAt: number } }
  | { type: 'MEDIA_PREVIEW'; payload: MediaPreviewPayload }
  | { type: 'REVEALING' }
  | { type: 'ROUND_END'; payload: RoundResult }
  | { type: 'GAME_OVER'; payload: GameResult }
  | { type: 'GAME_CONFIGURED'; payload: { gameType: string; questionCount: number } }
  | { type: 'PONG' }
  | { type: 'ERROR'; payload: { code: string; message: string } };

// Shared types
export type AnswerKey = 'A' | 'B' | 'C' | 'D';

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

export interface IdentityPayload {
  profile: {
    displayName: string;
    totalGames: number;
    totalWins: number;
  } | null;
}

export interface PlayerInfo {
  playerId: string;
  name: string;
  color: string;
}

export interface QuestionOption {
  key: AnswerKey;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  type?: 'multiple_choice' | 'true_false';
  options: QuestionOption[];
  timeLimit: number;
  questionNumber: number;
  totalQuestions: number;
  media?: {
    type: 'image' | 'audio' | 'video';
    url: string;
    previewDuration: number;
  };
}

export interface MediaPreviewPayload {
  questionNumber: number;
  totalQuestions: number;
  media: { type: 'image' | 'audio' | 'video'; url: string };
  duration: number;
}

export interface PlayerResult {
  playerId: string;
  name: string;
  answer: AnswerKey | null;
  isCorrect: boolean;
  responseTimeMs: number | null;
  baseScore: number;
  difficultyMultiplier: number;
  pointsEarned: number;
  totalScore: number;
  difficulty?: number;
}

export interface RoundResult {
  questionId: string;
  correctAnswer: AnswerKey;
  tags?: string[];
  playerResults: PlayerResult[];
  rankings?: PlayerRanking[];
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

// Host -> Server messages
export type HostMessage =
  | { type: 'START_GAME' }
  | { type: 'RESET_GAME' }
  | { type: 'SET_LANGUAGE'; payload: { language: string } }
  | { type: 'CONFIGURE_GAME'; payload: ConfigureGamePayload };

export interface ConfigureGamePayload {
  gameType: 'casual' | 'configured';
  questionSetId?: string;
  totalQuestions?: number;
  questionTimeLimit?: number;
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
