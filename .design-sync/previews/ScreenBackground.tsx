import { Button, ScreenBackground } from '@unfairenough/ui';

// ScreenBackground is flex:1 — give it a sized frame so it fills like a screen.
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 480, height: 280, display: 'flex' }}>{children}</div>
);

export const AsScreen = () => (
  <Frame>
    <ScreenBackground style={{ alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <div style={{ color: '#FFFFFF', fontSize: 28, fontFamily: 'Fredoka_600SemiBold' }}>Unfair Enough!</div>
      <div style={{ color: '#E0E0E0', fontSize: 15, fontFamily: 'Nunito_400Regular' }}>
        The deep-indigo backdrop every screen sits on
      </div>
      <Button title="Start Game" variant="primary" onPress={() => {}} />
    </ScreenBackground>
  </Frame>
);
