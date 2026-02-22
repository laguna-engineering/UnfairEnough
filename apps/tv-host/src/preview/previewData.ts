import type { GamePhase, RootState } from '@unfairenough/game-logic';
import { sampleQuestions } from '@unfairenough/game-logic';
import type { AnswerKey } from '@unfairenough/ws-protocol';

const MOCK_PLAYERS = [
  { id: 'p1', name: 'Alice', color: '#FF6B9D', emoji: '🦊', score: 2450 },
  { id: 'p2', name: 'Bob', color: '#4ECDC4', emoji: '🐙', score: 1820 },
  { id: 'p3', name: 'Charlie', color: '#FFE66D', emoji: '🦄', score: 1540 },
  { id: 'p4', name: 'Diana', color: '#AA96DA', emoji: '🐲', score: 980 },
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
    ['p2', 'p1', 'p3', 'p4'],
    ['p1', 'p2', 'p4', 'p3'],
    ['p1', 'p3', 'p2', 'p4'],
    ['p1', 'p2', 'p3', 'p4'],
    ['p1', 'p2', 'p3', 'p4'],
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
  const q = sampleQuestions[0];
  return MOCK_PLAYERS.map((p, i) => ({
    playerId: p.id,
    name: p.name,
    answer: (i < 3 ? q.correctAnswer : 'A') as AnswerKey,
    isCorrect: i < 3,
    responseTimeMs: 2000 + i * 1500,
    baseScore: 100,
    difficultyMultiplier: 1.0,
    timeBonusMultiplier: 1.5 - i * 0.2,
    pointsEarned: i < 3 ? 150 - i * 30 : 0,
    totalScore: p.score,
  }));
}

function buildMockAnswers(): Record<
  string,
  { playerId: string; answer: AnswerKey; serverReceivedAt: number }
> {
  // 2 of 4 players have answered — shows "2/4 answered" on QUESTION screen
  return {
    p1: { playerId: 'p1', answer: 'C', serverReceivedAt: Date.now() - 3000 },
    p2: { playerId: 'p2', answer: 'B', serverReceivedAt: Date.now() - 1500 },
  };
}

const sampleQ = sampleQuestions[0];
const MOCK_QUESTION = {
  id: sampleQ.id,
  text: sampleQ.text,
  options: sampleQ.options,
  timeLimit: 15,
  questionNumber: 5,
  totalQuestions: 10,
  serverTimestamp: Date.now(),
};

export function buildPreviewState(phase: GamePhase): RootState {
  const players = buildPlayersState();
  const rankings = buildRankings();
  const positionHistory = buildPositionHistory();
  const roundResults = buildRoundResults();

  const baseGame = {
    phase,
    currentQuestion: null as typeof MOCK_QUESTION | null,
    mediaPreview: null as { type: 'image' | 'audio' | 'video'; url: string } | null,
    questionIndex: 4,
    countdown: 0,
    answers: {} as Record<
      string,
      { playerId: string; answer: AnswerKey; serverReceivedAt: number }
    >,
    roundResults: [] as typeof roundResults,
    correctAnswer: null as AnswerKey | null,
    roundTags: [] as string[],
    rankings: [] as typeof rankings,
    positionHistory: [] as typeof positionHistory,
    config: { totalQuestions: 10, questionTimeLimit: 15, minPlayers: 1 },
    roomCode: 'PREV',
    serverPort: null as number | null,
    localIp: null as string | null,
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
            url: 'https://placehold.co/800x600/1a1a2e/ffffff?text=Preview',
          },
          countdown: 5,
        },
        players,
      };

    case 'QUESTION':
      return {
        game: {
          ...baseGame,
          currentQuestion: MOCK_QUESTION,
          countdown: 12,
          answers: buildMockAnswers(),
        },
        players,
      };

    case 'REVEALING':
      return {
        game: {
          ...baseGame,
          currentQuestion: MOCK_QUESTION,
          countdown: 0,
          correctAnswer: sampleQ.correctAnswer,
          roundResults,
          rankings,
        },
        players,
      };

    case 'RESULTS':
      return {
        game: {
          ...baseGame,
          currentQuestion: MOCK_QUESTION,
          correctAnswer: sampleQ.correctAnswer,
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
