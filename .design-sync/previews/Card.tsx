import { Card, PlayerAvatar } from '@unfairenough/ui';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: '#1a1a2e',
      padding: 24,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 20,
      alignItems: 'flex-start',
    }}
  >
    {children}
  </div>
);

// Card renders a gradient surface; realistic content is a DS component or
// light-on-dark text (the theme's textPrimary).
const Body = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ minWidth: 160 }}>
    <div style={{ color: '#FFFFFF', fontSize: 18, fontFamily: 'Nunito_700Bold', marginBottom: 6 }}>{title}</div>
    <div style={{ color: '#E0E0E0', fontSize: 14, fontFamily: 'Nunito_400Regular' }}>{sub}</div>
  </div>
);

export const Default = () => (
  <Stage>
    <Card variant="default">
      <Body title="Round 3 of 10" sub="Geography · Hard" />
    </Card>
  </Stage>
);

export const Elevated = () => (
  <Stage>
    <Card variant="elevated">
      <Body title="Final Scores" sub="Tap to reveal the winner" />
    </Card>
  </Stage>
);

export const Glow = () => (
  <Stage>
    <Card variant="glow" glowColor="#FF6B9D">
      <PlayerAvatar name="Ada Lovelace" color="#FF6B9D" emoji="🦄" score={4200} showScore size="large" />
    </Card>
  </Stage>
);
