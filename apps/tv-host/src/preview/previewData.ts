import type { GamePhase, RootState } from '@unfairenough/game-logic';
import { sampleQuestions } from '@unfairenough/game-logic';
import { MAX_NAME_LENGTH } from '@unfairenough/shared';
import type { AnswerKey, Question, QuestionType } from '@unfairenough/ws-protocol';
import { Image } from 'react-native';

// react-native-web's Image has no static resolveAssetSource; guard so the web
// preview harness (used for layout QA) doesn't crash at module load.
const PREVIEW_IMAGE_URI =
  typeof Image.resolveAssetSource === 'function'
    ? Image.resolveAssetSource(require('../../assets/preview-media.jpg')).uri
    : '';

/**
 * Knobs the preview harness accepts, so one URL can pin down an exact layout
 * case — `?preview=RESULTS&players=12&type=closest_wins`. Screenshot tests use
 * these to sweep the crowded-room cases a real 12-player game produces.
 */
export interface PreviewOptions {
  /**
   * Players in the room. A real room caps at 12; the roster goes to 50 so the
   * screenshots can show what these layouts do if the cap is ever raised.
   * Defaults to 8.
   */
  players?: number;
  /** Question type the QUESTION / RESULTS screens render. Defaults to multiple_choice. */
  questionType?: QuestionType;
  /** How many players have answered on the QUESTION screen. Defaults to ~⅔ of the room. */
  answered?: number;
  /**
   * Swap the roster for worst-case names: every one exactly MAX_NAME_LENGTH
   * characters with no spaces to wrap on. This is what proves the cap is low
   * enough for the layouts, so it is the roster the long-name screenshots use.
   */
  longNames?: boolean;
}

interface MockPlayer {
  id: string;
  name: string;
  color: string;
  emoji: string;
  score: number;
}

/** The room as a real game can have it — hand-authored names, colors and scores. */
const ROOM_PLAYERS: MockPlayer[] = [
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
 * Names past the room cap, for the over-capacity screenshot tier. Deliberately
 * uneven in length — a wall of same-width names hides the truncation problems a
 * real crowd would surface.
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

const MOCK_PLAYERS: MockPlayer[] = [
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

export const MAX_PREVIEW_PLAYERS = MOCK_PLAYERS.length;

/**
 * A name of exactly MAX_NAME_LENGTH characters with no space to break on —
 * the widest thing the join screen can produce. Seeded off the player's real
 * name so the roster stays distinguishable and deterministic.
 */
function worstCaseName(name: string): string {
  return `${name}stiltskinbottomsworth`.slice(0, MAX_NAME_LENGTH);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pickPlayers(count: number, longNames = false): MockPlayer[] {
  const picked = MOCK_PLAYERS.slice(0, clamp(Math.round(count), 1, MAX_PREVIEW_PLAYERS));
  return longNames ? picked.map((p) => ({ ...p, name: worstCaseName(p.name) })) : picked;
}

function buildPlayersState(players: MockPlayer[]) {
  return {
    ids: players.map((p) => p.id),
    entities: Object.fromEntries(players.map((p) => [p.id, { ...p, isConnected: true }])),
  };
}

function buildRankings(players: MockPlayer[]) {
  return players.map((p, i) => ({
    playerId: p.id,
    name: p.name,
    score: p.score,
    rank: i + 1,
  }));
}

const HISTORY_ROUNDS = 5;

/**
 * Rank history for the GAME_OVER chart. Early rounds jumble the standings and
 * the jumble decays to zero, so the last snapshot always matches the final
 * ranking. Deterministic (no RNG) so screenshots are reproducible.
 */
function buildPositionHistory(players: MockPlayer[]) {
  return Array.from({ length: HISTORY_ROUNDS }, (_, i) => {
    const round = i + 1;
    const jitter = (HISTORY_ROUNDS - round) / HISTORY_ROUNDS;
    const order = players
      .map((player, index) => ({
        player,
        sortKey: index + (((index * 37 + round * 17) % 11) - 5) * jitter,
      }))
      .sort((a, b) => a.sortKey - b.sortKey);

    return {
      round,
      positions: order.map(({ player }, rank) => ({
        playerId: player.id,
        name: player.name,
        rank: rank + 1,
        score: Math.round((player.score * round) / HISTORY_ROUNDS),
      })),
    };
  });
}

/** How many players got it right — a bit under half the room. */
function correctCount(playerCount: number): number {
  return Math.max(1, Math.ceil(playerCount * 0.45));
}

const CHOICE_QUESTION: Question & { serverTimestamp: number } = {
  id: sampleQuestions[0].id,
  text: 'In the famous 1969 Apollo 11 mission, which astronaut remained in lunar orbit aboard the Command Module Columbia while Neil Armstrong and Buzz Aldrin walked on the surface of the Moon?',
  type: 'multiple_choice',
  options: [
    {
      key: 'A' as const,
      text: 'Buzz Aldrin, who later became famous for advocating Mars colonization',
    },
    { key: 'B' as const, text: 'John Glenn, the first American to orbit the Earth in 1962' },
    { key: 'C' as const, text: 'Michael Collins, often called the loneliest man in history' },
    {
      key: 'D' as const,
      text: 'Alan Shepard, who later played golf on the Moon during Apollo 14',
    },
  ],
  timeLimit: 15,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

const TRUE_FALSE_QUESTION: Question & { serverTimestamp: number } = {
  id: 'preview-true-false',
  text: 'The Great Wall of China is the only man-made structure visible from the Moon with the naked eye.',
  type: 'true_false',
  options: [
    { key: 'A' as const, text: 'True' },
    { key: 'B' as const, text: 'False' },
  ],
  timeLimit: 10,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

const CLOSEST_WINS_QUESTION: Question & { serverTimestamp: number } = {
  id: 'preview-closest-wins',
  text: 'How many kilometres of coastline does Italy have?',
  type: 'closest_wins',
  options: [],
  range: { min: 0, max: 12000, step: 100 },
  timeLimit: 20,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

const CLOSEST_WINS_CORRECT_VALUE = 7600;

const PREDICT_ROOM_QUESTION: Question & { serverTimestamp: number } = {
  id: 'preview-predict-room',
  text: 'Which of these is the most overrated tourist attraction?',
  type: 'predict_room',
  options: [
    { key: 'A' as const, text: 'The Mona Lisa' },
    { key: 'B' as const, text: 'The Leaning Tower of Pisa' },
    { key: 'C' as const, text: 'The Hollywood Walk of Fame' },
    { key: 'D' as const, text: 'Times Square on New Year’s Eve' },
  ],
  timeLimit: 15,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: 0,
};

function questionFor(type: QuestionType): Question & { serverTimestamp: number } {
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

/**
 * A guess per player, deliberately lumpy: most cluster near the answer (so the
 * closest-wins lanes have to fan out overlapping chips) and two land outside
 * the range to exercise the outlier strip.
 */
function guessFor(index: number, playerCount: number): number {
  if (index === playerCount - 1 && playerCount > 4) return 12800; // above max
  if (index === playerCount - 2 && playerCount > 6) return -400; // below min
  const spread = [50, 150, -220, 380, -520, 700, 1400, -1800, 2600, -3100, 4200, 5400];
  // Past the authored spread the offsets repeat with a small nudge, so an
  // over-capacity room still clusters near the answer instead of marching off
  // in a straight line.
  const offset = spread[index % spread.length] + Math.floor(index / spread.length) * 90;
  return CLOSEST_WINS_CORRECT_VALUE + offset;
}

function buildChoiceResults(players: MockPlayer[], correctAnswer: AnswerKey, wrongKey: AnswerKey) {
  const correct = correctCount(players.length);
  return players.map((p, i) => ({
    playerId: p.id,
    name: p.name,
    answer: (i < correct ? correctAnswer : wrongKey) as AnswerKey,
    isCorrect: i < correct,
    responseTimeMs: 2000 + i * 600,
    baseScore: 100,
    difficultyMultiplier: 1.0,
    timeBonusMultiplier: Math.max(1.5 - i * 0.1, 0.5),
    pointsEarned: i < correct ? 150 - i * 15 : 0,
    totalScore: p.score,
  }));
}

function buildClosestWinsResults(players: MockPlayer[]) {
  const guesses = players.map((p, i) => ({ player: p, guess: guessFor(i, players.length) }));
  const closest = guesses.reduce((best, g) =>
    Math.abs(g.guess - CLOSEST_WINS_CORRECT_VALUE) <
    Math.abs(best.guess - CLOSEST_WINS_CORRECT_VALUE)
      ? g
      : best,
  );

  return guesses.map(({ player, guess }, i) => {
    const distance = Math.abs(guess - CLOSEST_WINS_CORRECT_VALUE);
    const isClosest = player.id === closest.player.id;
    return {
      playerId: player.id,
      name: player.name,
      answer: null,
      isCorrect: isClosest,
      responseTimeMs: 3000 + i * 500,
      baseScore: 100,
      difficultyMultiplier: 1.0,
      guess,
      distance: distance / 12000,
      isClosest,
      pointsEarned: isClosest ? 150 : Math.max(0, 100 - Math.round(distance / 100)),
      totalScore: player.score,
    };
  });
}

// A believable split across all four options with a clear winner in B.
const VOTE_PATTERN: AnswerKey[] = ['B', 'A', 'B', 'C', 'B', 'D', 'A', 'B', 'C', 'B', 'D', 'A'];

/** Everyone votes; the room's pick is B, and every third player called it. */
function buildPredictRoomRound(players: MockPlayer[]) {
  const votes: Record<string, AnswerKey> = {};
  const voteCounts: Partial<Record<AnswerKey, number>> = {};

  players.forEach((p, i) => {
    const key = VOTE_PATTERN[i % VOTE_PATTERN.length];
    votes[p.id] = key;
    voteCounts[key] = (voteCounts[key] ?? 0) + 1;
  });

  const winningOptions: AnswerKey[] = ['B'];

  const predictions = Object.fromEntries(
    players.map((p, i) => [
      p.id,
      {
        playerId: p.id,
        prediction: (i % 3 === 0 ? 'B' : 'A') as AnswerKey,
        serverReceivedAt: i * 100,
      },
    ]),
  );

  const results = players.map((p, i) => {
    const predictedCorrectly = i % 3 === 0;
    return {
      playerId: p.id,
      name: p.name,
      answer: null,
      isCorrect: predictedCorrectly,
      responseTimeMs: 2500 + i * 400,
      baseScore: 100,
      difficultyMultiplier: 1.0,
      prediction: (predictedCorrectly ? 'B' : 'A') as AnswerKey,
      predictedCorrectly,
      pointsEarned: predictedCorrectly ? 120 : 0,
      totalScore: p.score,
    };
  });

  return { votes, voteCounts, winningOptions, predictions, results };
}

export function buildPreviewState(phase: GamePhase, options: PreviewOptions = {}): RootState {
  const mockPlayers = pickPlayers(options.players ?? 8, options.longNames);
  const players = buildPlayersState(mockPlayers);
  const rankings = buildRankings(mockPlayers);
  const positionHistory = buildPositionHistory(mockPlayers);
  const questionType = options.questionType ?? 'multiple_choice';
  const question = questionFor(questionType);
  const answeredCount = clamp(
    Math.round(options.answered ?? Math.ceil(mockPlayers.length * 0.66)),
    0,
    mockPlayers.length,
  );
  const answeredPlayers = mockPlayers.slice(0, answeredCount);
  const predictRoom = buildPredictRoomRound(mockPlayers);

  const correctAnswer: AnswerKey =
    questionType === 'true_false' ? 'B' : (sampleQuestions[0].correctAnswer as AnswerKey);
  const wrongAnswer: AnswerKey = 'A';

  const roundResults =
    questionType === 'closest_wins'
      ? buildClosestWinsResults(mockPlayers)
      : questionType === 'predict_room'
        ? predictRoom.results
        : buildChoiceResults(mockPlayers, correctAnswer, wrongAnswer);

  const baseGame: RootState['game'] = {
    phase,
    currentQuestion: null,
    mediaPreview: null,
    questionIndex: 4,
    countdown: 0,
    answers: {},
    votes: {},
    predictions: {},
    roundResults: [],
    correctAnswer: null,
    roundTags: [],
    rankings: [],
    positionHistory: [],
    config: { totalQuestions: 10, questionTimeLimit: question.timeLimit, minPlayers: 1 },
    roomCode: 'PREV',
    serverPort: null,
    localIp: null,
    configError: null,
  };

  switch (phase) {
    case 'LOBBY':
      return {
        game: { ...baseGame, questionIndex: 0, countdown: 0 },
        players,
      };

    case 'COUNTDOWN':
      return {
        game: { ...baseGame, countdown: 3 },
        players,
      };

    case 'MEDIA_PREVIEW':
      return {
        game: {
          ...baseGame,
          mediaPreview: {
            type: 'image',
            url: PREVIEW_IMAGE_URI,
            questionNumber: 1,
            totalQuestions: 10,
          },
          countdown: 5,
        },
        players,
      };

    case 'QUESTION': {
      // Each question type counts a different dict: answers for the choice and
      // closest_wins types, votes + predictions for predict_room.
      const answers = Object.fromEntries(
        answeredPlayers.map((p, i) => [
          p.id,
          questionType === 'closest_wins'
            ? { playerId: p.id, guess: guessFor(i, mockPlayers.length), serverReceivedAt: i * 100 }
            : {
                playerId: p.id,
                answer: (i % 3 === 0 ? correctAnswer : wrongAnswer) as AnswerKey,
                serverReceivedAt: i * 100,
              },
        ]),
      );

      const votes =
        questionType === 'predict_room'
          ? Object.fromEntries(answeredPlayers.map((p) => [p.id, predictRoom.votes[p.id]]))
          : {};
      // Predictions lag the votes by design — a player predicts after voting.
      const predictions =
        questionType === 'predict_room'
          ? Object.fromEntries(
              answeredPlayers
                .slice(0, Math.max(0, answeredPlayers.length - 2))
                .map((p) => [p.id, predictRoom.predictions[p.id]]),
            )
          : {};

      return {
        game: {
          ...baseGame,
          currentQuestion: question,
          countdown: Math.round(question.timeLimit * 0.8),
          answers: questionType === 'predict_room' ? {} : answers,
          votes,
          predictions,
        },
        players,
      };
    }

    case 'REVEALING':
      return {
        game: {
          ...baseGame,
          currentQuestion: question,
          countdown: 0,
          correctAnswer,
          questionType,
          roundResults,
          rankings,
        },
        players,
      };

    case 'RESULTS':
      return {
        game: {
          ...baseGame,
          currentQuestion: question,
          correctAnswer,
          questionType,
          correctValue: CLOSEST_WINS_CORRECT_VALUE,
          voteCounts: predictRoom.voteCounts,
          winningOptions: predictRoom.winningOptions,
          roundResults,
          roundTags: ['geography', 'capitals'],
          rankings,
          positionHistory,
        },
        players,
      };

    case 'GAME_OVER':
      return {
        game: {
          ...baseGame,
          rankings,
          positionHistory,
        },
        players,
      };

    default:
      return { game: baseGame, players };
  }
}
