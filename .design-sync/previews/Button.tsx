import { Button } from '@unfairenough/ui';

// Neon Sakura is a dark theme — cards render on the app's deep-indigo ground.
const Stage = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: '#1a1a2e',
      padding: 24,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
      alignItems: 'center',
    }}
  >
    {children}
  </div>
);

const noop = () => {};

export const Variants = () => (
  <Stage>
    <Button title="Play Again" variant="primary" onPress={noop} />
    <Button title="How to Play" variant="secondary" onPress={noop} />
    <Button title="Leave Room" variant="outline" onPress={noop} />
  </Stage>
);

export const Sizes = () => (
  <Stage>
    <Button title="Small" size="small" onPress={noop} />
    <Button title="Medium" size="medium" onPress={noop} />
    <Button title="Large" size="large" onPress={noop} />
  </Stage>
);

export const States = () => (
  <Stage>
    <Button title="Submitting…" loading onPress={noop} />
    <Button title="Start Game" disabled onPress={noop} />
  </Stage>
);
