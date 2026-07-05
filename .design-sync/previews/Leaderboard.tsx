import { Leaderboard } from '@unfairenough/ui';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#1a1a2e', padding: 24, minWidth: 340 }}>{children}</div>
);

const entries = [
  { playerId: 'p1', name: 'Ada Lovelace', rank: 1, score: 4200, pointsEarned: 500, color: '#FF6B9D', isCorrect: true, rankChange: 2 },
  { playerId: 'p2', name: 'Alan Turing', rank: 2, score: 3850, pointsEarned: 300, color: '#4ECDC4', isCorrect: true, rankChange: -1 },
  { playerId: 'p3', name: 'Grace Hopper', rank: 3, score: 3600, pointsEarned: 0, color: '#FFE66D', isCorrect: false, rankChange: -1 },
  { playerId: 'p4', name: 'Katherine Johnson', rank: 4, score: 2900, pointsEarned: 200, color: '#95E1D3', isCorrect: true, rankChange: 0 },
  { playerId: 'p5', name: 'Linus Torvalds', rank: 5, score: 2400, pointsEarned: 150, color: '#F38181', isCorrect: true, rankChange: 1 },
];

export const Standings = () => (
  <Stage>
    <Leaderboard entries={entries} />
  </Stage>
);

export const WithPointsAndRankChange = () => (
  <Stage>
    <Leaderboard entries={entries} showPoints showRankChange highlightPlayerId="p4" />
  </Stage>
);
