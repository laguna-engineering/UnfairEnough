import type { RootState } from '@unfairenough/game-logic';

export interface IGameController {
  initialize(): Promise<void>;
  getState(): RootState;
  subscribe(listener: () => void): () => void;
  startGame(): void;
  reset(): void;
  configureGame(gameType: 'casual' | 'configured', questionSetId?: string): void;
  setLanguage(language: string): void;
  cleanup(): void;
}
