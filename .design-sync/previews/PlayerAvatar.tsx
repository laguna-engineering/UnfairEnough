import { PlayerAvatar } from '@unfairenough/ui';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#1a1a2e', padding: 24, display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
    {children}
  </div>
);

export const Sizes = () => (
  <Stage>
    <PlayerAvatar name="Ada Lovelace" color="#FF6B9D" emoji="🦄" size="small" />
    <PlayerAvatar name="Alan Turing" color="#4ECDC4" emoji="🦊" size="medium" />
    <PlayerAvatar name="Grace Hopper" color="#FFE66D" emoji="🐙" size="large" />
  </Stage>
);

export const WithScores = () => (
  <Stage>
    <PlayerAvatar name="Ada Lovelace" color="#FF6B9D" emoji="🦄" score={4200} showScore />
    <PlayerAvatar name="Alan Turing" color="#4ECDC4" emoji="🦊" score={3850} showScore />
    <PlayerAvatar name="Grace Hopper" color="#FFE66D" emoji="🐙" score={3600} showScore />
    <PlayerAvatar name="Katherine Johnson" color="#95E1D3" emoji="🦋" score={2900} showScore />
  </Stage>
);

export const Initials = () => (
  <Stage>
    <PlayerAvatar name="Linus Torvalds" color="#F38181" size="large" />
    <PlayerAvatar name="Margaret Hamilton" color="#AA96DA" size="large" />
  </Stage>
);
