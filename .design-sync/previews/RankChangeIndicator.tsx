import { RankChangeIndicator } from '@unfairenough/ui';

const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
    {children}
    <span style={{ color: '#E0E0E0', fontSize: 12, fontFamily: 'Nunito_400Regular' }}>{label}</span>
  </div>
);

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#1a1a2e', padding: 24, display: 'flex', gap: 40, alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </div>
);

export const Movements = () => (
  <Stage>
    <Cell label="Climbed 3">
      <RankChangeIndicator change={3} />
    </Cell>
    <Cell label="No change">
      <RankChangeIndicator change={0} />
    </Cell>
    <Cell label="Dropped 2">
      <RankChangeIndicator change={-2} />
    </Cell>
  </Stage>
);
