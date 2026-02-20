import type React from 'react';
import { createContext, useContext } from 'react';
import type { IGameController } from '../services/IGameController';

export type GameMode = 'local' | 'hosted';

interface GameModeContextValue {
  mode: GameMode;
  controller: IGameController;
  serverUrl?: string;
  mobileBaseUrl?: string;
}

const GameModeContext = createContext<GameModeContextValue | null>(null);

export function useGameMode(): GameModeContextValue {
  const ctx = useContext(GameModeContext);
  if (!ctx) throw new Error('useGameMode must be used within a GameModeProvider');
  return ctx;
}

interface GameModeProviderProps {
  mode: GameMode;
  controller: IGameController;
  serverUrl?: string;
  mobileBaseUrl?: string;
  children: React.ReactNode;
}

export const GameModeProvider: React.FC<GameModeProviderProps> = ({
  mode,
  controller,
  serverUrl,
  mobileBaseUrl,
  children,
}) => (
  <GameModeContext.Provider value={{ mode, controller, serverUrl, mobileBaseUrl }}>
    {children}
  </GameModeContext.Provider>
);
