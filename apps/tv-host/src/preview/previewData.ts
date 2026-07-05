import type { GamePhase, RootState } from '@unfairenough/game-logic';
import { sampleQuestions } from '@unfairenough/game-logic';
import type { AnswerKey } from '@unfairenough/ws-protocol';
import { Image } from 'react-native';

// react-native-web's Image has no static resolveAssetSource; guard so the web
// preview harness (used for layout QA) doesn't crash at module load.
const PREVIEW_IMAGE_URI =
  typeof Image.resolveAssetSource === 'function'
    ? Image.resolveAssetSource(require('../../assets/preview-media.jpg')).uri
    : '';

const MOCK_PLAYERS = [
  { id: 'p1', name: 'Alice', color: '#FF6B9D', emoji: '🦊', score: 2450 },
  { id: 'p2', name: 'Bob', color: '#4ECDC4', emoji: '🐙', score: 1820 },
  { id: 'p3', name: 'Charlie', color: '#FFE66D', emoji: '🦄', score: 1540 },
  { id: 'p4', name: 'Diana', color: '#AA96DA', emoji: '🐲', score: 980 },
  { id: 'p5', name: 'Enzo', color: '#FF8A65', emoji: '🦁', score: 870 },
  { id: 'p6', name: 'Fiona', color: '#81C784', emoji: '🐸', score: 650 },
  { id: 'p7', name: 'George', color: '#64B5F6', emoji: '🐳', score: 420 },
  { id: 'p8', name: 'Hana', color: '#F06292', emoji: '🦋', score: 310 },
] as const;

function buildPlayersState() {
  return {
    ids: MOCK_PLAYERS.map((p) => p.id),
    entities: Object.fromEntries(MOCK_PLAYERS.map((p) => [p.id, { ...p, isConnected: true }])),
  };
}

function buildRankings() {
  return MOCK_PLAYERS.map((p, i) => ({
    playerId: p.id,
    name: p.name,
    score: p.score,
    rank: i + 1,
  }));
}

function buildPositionHistory() {
  // 5 rounds of history with shuffled rankings — needed for GAME_OVER chart
  const rounds = [
    ['p2', 'p1', 'p3', 'p5', 'p4', 'p8', 'p6', 'p7'],
    ['p1', 'p2', 'p4', 'p3', 'p6', 'p5', 'p7', 'p8'],
    ['p1', 'p3', 'p2', 'p5', 'p4', 'p6', 'p8', 'p7'],
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
  ];
  return rounds.map((order, i) => ({
    round: i + 1,
    positions: order.map((id, rank) => {
      const player = MOCK_PLAYERS.find((p) => p.id === id)!;
      return {
        playerId: id,
        name: player.name,
        rank: rank + 1,
        score: player.score - (5 - i) * 200 + rank * 100,
      };
    }),
  }));
}

function buildRoundResults() {
  return MOCK_PLAYERS.map((p, i) => ({
    playerId: p.id,
    name: p.name,
    answer: (i < 5 ? 'C' : 'A') as AnswerKey,
    isCorrect: i < 5,
    responseTimeMs: 2000 + i * 800,
    baseScore: 100,
    difficultyMultiplier: 1.0,
    timeBonusMultiplier: Math.max(1.5 - i * 0.15, 0.5),
    pointsEarned: i < 5 ? 150 - i * 25 : 0,
    totalScore: p.score,
  }));
}

function buildMockAnswers(): Record<
  string,
  { playerId: string; answer: AnswerKey; serverReceivedAt: number }
> {
  // 5 of 8 players have answered — shows "5/8 answered" on QUESTION screen
  return {
    p1: { playerId: 'p1', answer: 'C', serverReceivedAt: Date.now() - 3000 },
    p2: { playerId: 'p2', answer: 'C', serverReceivedAt: Date.now() - 2500 },
    p3: { playerId: 'p3', answer: 'A', serverReceivedAt: Date.now() - 2000 },
    p4: { playerId: 'p4', answer: 'C', serverReceivedAt: Date.now() - 1500 },
    p5: { playerId: 'p5', answer: 'B', serverReceivedAt: Date.now() - 800 },
  };
}

function buildMockQuestion() {
  return {
    id: sampleQuestions[0].id,
    text: 'In the famous 1969 Apollo 11 mission, which astronaut remained in lunar orbit aboard the Command Module Columbia while Neil Armstrong and Buzz Aldrin walked on the surface of the Moon?',
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
    serverTimestamp: Date.now(),
  };
}

export function buildPreviewState(phase: GamePhase): RootState {
  const players = buildPlayersState();
  const rankings = buildRankings();
  const positionHistory = buildPositionHistory();
  const roundResults = buildRoundResults();
  const mockQuestion = buildMockQuestion();
  const correctAnswer = sampleQuestions[0].correctAnswer;

  const baseGame: RootState['game'] = {
    phase,
    currentQuestion: null,
    mediaPreview: null,
    questionIndex: 4,
    countdown: 0,
    answers: {},
    roundResults: [],
    correctAnswer: null,
    roundTags: [],
    rankings: [],
    positionHistory: [],
    config: { totalQuestions: 10, questionTimeLimit: 15, minPlayers: 1 },
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

    case 'QUESTION':
      return {
        game: {
          ...baseGame,
          currentQuestion: mockQuestion,
          countdown: 12,
          answers: buildMockAnswers(),
        },
        players,
      };

    case 'REVEALING':
      return {
        game: {
          ...baseGame,
          currentQuestion: mockQuestion,
          countdown: 0,
          correctAnswer,
          roundResults,
          rankings,
        },
        players,
      };

    case 'RESULTS':
      return {
        game: {
          ...baseGame,
          currentQuestion: mockQuestion,
          correctAnswer,
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
