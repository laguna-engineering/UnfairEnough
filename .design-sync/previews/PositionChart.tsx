import { PositionChart } from '@unfairenough/ui';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#1a1a2e', padding: 20 }}>{children}</div>
);

const players = [
  { playerId: 'p1', name: 'Ada', color: '#FF6B9D' },
  { playerId: 'p2', name: 'Alan', color: '#4ECDC4' },
  { playerId: 'p3', name: 'Grace', color: '#FFE66D' },
  { playerId: 'p4', name: 'Katherine', color: '#95E1D3' },
  { playerId: 'p5', name: 'Linus', color: '#F38181' },
];

const rank = (order: string[]) => ({
  positions: order.map((playerId, i) => ({ playerId, rank: i + 1 })),
});

const positionHistory = [
  { round: 1, ...rank(['p1', 'p2', 'p3', 'p4', 'p5']) },
  { round: 2, ...rank(['p2', 'p1', 'p4', 'p3', 'p5']) },
  { round: 3, ...rank(['p1', 'p4', 'p2', 'p5', 'p3']) },
  { round: 4, ...rank(['p4', 'p1', 'p5', 'p2', 'p3']) },
  { round: 5, ...rank(['p1', 'p4', 'p2', 'p3', 'p5']) },
];

export const RaceOverRounds = () => (
  <Stage>
    <PositionChart players={players} positionHistory={positionHistory} width={560} height={280} />
  </Stage>
);
