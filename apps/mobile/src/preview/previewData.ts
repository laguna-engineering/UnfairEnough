import type {
  AnswerKey,
  GameResult,
  MediaPreviewPayload,
  PlayerResult,
  ProfileSummary,
  Question,
  QuestionType,
  RoundResult,
  WelcomePayload,
} from '@unfairenough/ws-protocol';
import type { GuestSession } from '../services/authStorage';

/**
 * Fixed data behind the `?preview=` harness (see PreviewScreen). Every value is
 * deterministic — no Date.now(), no randomness — so screenshots of the same URL
 * are identical run to run.
 */

export const PREVIEW_PLAYER_ID = 'p3';

interface PreviewPlayer {
  id: string;
  name: string;
  color: string;
  emoji: string;
  score: number;
}

/** The room as a real game can have it — a real room caps at 12. */
const ROOM_PLAYERS: PreviewPlayer[] = [
  { id: 'p1', name: 'Alice', color: '#FF6B9D', emoji: '🦊', score: 2450 },
  { id: 'p2', name: 'Bob', color: '#4ECDC4', emoji: '🐙', score: 1820 },
  { id: 'p3', name: 'Charlie', color: '#FFE66D', emoji: '🦄', score: 1540 },
  { id: 'p4', name: 'Diana', color: '#AA96DA', emoji: '🐲', score: 980 },
  { id: 'p5', name: 'Enzo', color: '#FF8A65', emoji: '🦁', score: 870 },
  { id: 'p6', name: 'Fiona', color: '#81C784', emoji: '🐸', score: 650 },
  { id: 'p7', name: 'George', color: '#64B5F6', emoji: '🐳', score: 420 },
  { id: 'p8', name: 'Hana', color: '#F06292', emoji: '🦋', score: 310 },
  { id: 'p9', name: 'Ivan', color: '#BA68C8', emoji: '🦉', score: 260 },
  { id: 'p10', name: 'Jasmine', color: '#4DD0E1', emoji: '🐬', score: 190 },
  { id: 'p11', name: 'Kwame', color: '#FFB74D', emoji: '🐝', score: 120 },
  { id: 'p12', name: 'Lucia', color: '#A1887F', emoji: '🦔', score: 60 },
];

/**
 * Names past the room cap, for the over-capacity screenshot tier. Uneven in
 * length on purpose, so name truncation shows up.
 */
const OVERFLOW_NAMES = [
  'Marco',
  'Nadia',
  'Oscar',
  'Priyanka',
  'Quentin',
  'Rosa',
  'Sven',
  'Tariq',
  'Ursula',
  'Viktor',
  'Wen',
  'Xiu',
  'Yara',
  'Zane',
  'Amara',
  'Bruno',
  'Chiara',
  'Dmitri',
  'Elena',
  'Farid',
  'Greta',
  'Hugo',
  'Ines',
  'Jonas',
  'Keiko',
  'Liam',
  'Mateo',
  'Noor',
  'Omar',
  'Paloma',
  'Rafael',
  'Sofia',
  'Thabo',
  'Umberto',
  'Valentina',
  'Willem',
  'Ximena',
  'Yusuf',
];

export const PREVIEW_PLAYERS: PreviewPlayer[] = [
  ...ROOM_PLAYERS,
  ...OVERFLOW_NAMES.map((name, i) => ({
    id: `p${ROOM_PLAYERS.length + i + 1}`,
    name,
    color: ROOM_PLAYERS[i % ROOM_PLAYERS.length].color,
    emoji: ROOM_PLAYERS[i % ROOM_PLAYERS.length].emoji,
    // Keeps the standings strictly descending below Lucia's 60.
    score: 55 - i,
  })),
];

export const MAX_PREVIEW_PLAYERS = PREVIEW_PLAYERS.length;

export function previewPlayers(count: number): PreviewPlayer[] {
  // The player whose phone this is must always be in the room.
  const clamped = Math.min(MAX_PREVIEW_PLAYERS, Math.max(3, Math.round(count)));
  return PREVIEW_PLAYERS.slice(0, clamped);
}

type PlayQuestion = Question & { serverTimestamp: number };

const CHOICE_QUESTION: PlayQuestion = {
  id: 'preview-mc',
  text: 'Which astronaut stayed in lunar orbit while Armstrong and Aldrin walked on the Moon?',
  type: 'multiple_choice',
  options: [
    { key: 'A', text: 'Buzz Aldrin' },
    { key: 'B', text: 'John Glenn' },
    { key: 'C', text: 'Michael Collins' },
    { key: 'D', text: 'Alan Shepard' },
  ],
  timeLimit: 15,
  questionNumber: 5,
  totalQuestions: 10,
  tags: ['space', 'history'],
  serverTimestamp: 0,
};

const TRUE_FALSE_QUESTION: PlayQuestion = {
  id: 'preview-tf',
  text: 'The Great Wall of China is visible from the Moon with the naked eye.',
  type: 'true_false',
  options: [
    { key: 'A', text: 'True' },
    { key: 'B', text: 'False' },
  ],
  timeLimit: 10,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

const CLOSEST_WINS_QUESTION: PlayQuestion = {
  id: 'preview-cw',
  text: 'How many kilometres of coastline does Italy have?',
  type: 'closest_wins',
  options: [],
  range: { min: 0, max: 12000, step: 100 },
  timeLimit: 20,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

const PREDICT_ROOM_QUESTION: PlayQuestion = {
  id: 'preview-pr',
  text: 'Which of these is the most overrated tourist attraction?',
  type: 'predict_room',
  options: [
    { key: 'A', text: 'The Mona Lisa' },
    { key: 'B', text: 'The Leaning Tower of Pisa' },
    { key: 'C', text: 'The Hollywood Walk of Fame' },
    { key: 'D', text: 'Times Square on New Year’s Eve' },
  ],
  timeLimit: 15,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

export const CLOSEST_WINS_CORRECT_VALUE = 7600;

export function previewQuestion(type: QuestionType): PlayQuestion {
  switch (type) {
    case 'true_false':
      return TRUE_FALSE_QUESTION;
    case 'closest_wins':
      return CLOSEST_WINS_QUESTION;
    case 'predict_room':
      return PREDICT_ROOM_QUESTION;
    default:
      return CHOICE_QUESTION;
  }
}

const VOTE_PATTERN: AnswerKey[] = ['B', 'A', 'B', 'C', 'B', 'D', 'A', 'B', 'C', 'B', 'D', 'A'];

function guessFor(index: number): number {
  const spread = [50, 150, -220, 380, -520, 700, 1400, -1800, 2600, -3100, 4200, 5400];
  // Past the authored spread the offsets repeat with a small nudge, so an
  // over-capacity room still clusters near the answer.
  return (
    CLOSEST_WINS_CORRECT_VALUE +
    spread[index % spread.length] +
    Math.floor(index / spread.length) * 90
  );
}

function rankings(players: PreviewPlayer[]) {
  return players.map((p, i) => ({ playerId: p.id, name: p.name, score: p.score, rank: i + 1 }));
}

function buildPlayerResults(players: PreviewPlayer[], type: QuestionType): PlayerResult[] {
  return players.map((player, i) => {
    const base: PlayerResult = {
      playerId: player.id,
      name: player.name,
      answer: null,
      isCorrect: false,
      responseTimeMs: 2000 + i * 600,
      baseScore: 100,
      difficultyMultiplier: 1.2,
      timeBonusMultiplier: Math.max(1.5 - i * 0.1, 0.5),
      pointsEarned: 0,
      totalScore: player.score,
    };

    if (type === 'closest_wins') {
      const guess = guessFor(i);
      const distance = Math.abs(guess - CLOSEST_WINS_CORRECT_VALUE);
      const isClosest = i === 0;
      return {
        ...base,
        guess,
        distance: distance / 12000,
        isClosest,
        isCorrect: isClosest,
        pointsEarned: isClosest ? 150 : Math.max(0, 100 - Math.round(distance / 100)),
      };
    }

    if (type === 'predict_room') {
      const predictedCorrectly = i % 3 === 0;
      return {
        ...base,
        prediction: predictedCorrectly ? 'B' : 'A',
        predictedCorrectly,
        isCorrect: predictedCorrectly,
        pointsEarned: predictedCorrectly ? 120 : 0,
      };
    }

    // Choice types: a bit under half the room gets it right.
    const correctKey: AnswerKey = type === 'true_false' ? 'B' : 'C';
    const isCorrect = i % 2 === 0;
    return {
      ...base,
      answer: isCorrect ? correctKey : 'A',
      isCorrect,
      pointsEarned: isCorrect ? 150 - i * 10 : 0,
    };
  });
}

export function previewRoundResult(type: QuestionType, playerCount: number): RoundResult {
  const players = previewPlayers(playerCount);
  const question = previewQuestion(type);

  const voteCounts: Partial<Record<AnswerKey, number>> = {};
  players.forEach((_, i) => {
    const key = VOTE_PATTERN[i % VOTE_PATTERN.length];
    voteCounts[key] = (voteCounts[key] ?? 0) + 1;
  });

  return {
    questionId: question.id,
    correctAnswer: type === 'closest_wins' || type === 'predict_room' ? null : 'C',
    tags: ['space', 'history'],
    questionDifficulty: 0.4,
    playerResults: buildPlayerResults(players, type),
    rankings: rankings(players),
    questionType: type,
    correctValue: CLOSEST_WINS_CORRECT_VALUE,
    voteCounts,
    winningOptions: ['B'],
  };
}

export function previewGameResult(playerCount: number): GameResult {
  const players = previewPlayers(playerCount);
  return {
    rankings: rankings(players),
    winner: { playerId: players[0].id, name: players[0].name, score: players[0].score },
  };
}

export const PREVIEW_WELCOME: WelcomePayload = {
  playerId: PREVIEW_PLAYER_ID,
  playerColor: '#FFE66D',
  roomCode: 'PREV',
  profile: { displayName: 'Charlie', totalGames: 24, totalWins: 6 },
};

export const PREVIEW_MEDIA_PREVIEW: MediaPreviewPayload = {
  questionNumber: 5,
  totalQuestions: 10,
  duration: 5,
};

export const PREVIEW_PROFILES: ProfileSummary[] = PREVIEW_PLAYERS.slice(0, 4).map((p, i) => ({
  id: p.id,
  displayName: p.name,
  avatarColor: p.color,
  avatarEmoji: p.emoji,
  totalGames: 24 - i * 5,
}));

export const PREVIEW_GUEST_SESSION: GuestSession = {
  sessionToken: 'preview-token',
  serverUrl: 'preview.local',
  playerName: 'Charlie',
  playerColor: '#FFE66D',
  playerEmoji: '🦄',
  hostDisplayName: 'Living room TV',
};
