import { Timer } from '@unfairenough/ui';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#1a1a2e', padding: 24, display: 'flex', gap: 32, alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </div>
);

// The ring/bar color shifts healthy → warning → danger as time runs out.
export const Healthy = () => (
  <Stage>
    <Timer seconds={18} totalSeconds={20} />
  </Stage>
);

export const Warning = () => (
  <Stage>
    <Timer seconds={8} totalSeconds={20} />
  </Stage>
);

export const Danger = () => (
  <Stage>
    <Timer seconds={3} totalSeconds={20} />
  </Stage>
);

export const Small = () => (
  <Stage>
    <Timer seconds={12} totalSeconds={20} size="small" />
  </Stage>
);
