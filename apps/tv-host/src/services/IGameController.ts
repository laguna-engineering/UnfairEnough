import type { RootState } from '@unfairenough/game-logic';

export interface IGameController {
  initialize(): Promise<void>;
  getState(): RootState;
  subscribe(listener: () => void): () => void;
  startGame(): void;
  reset(): void;
  configureGame(
    gameType: 'casual' | 'configured' | 'personalized',
    questionSetId?: string,
    options?: {
      tags?: string[];
      totalQuestions?: number;
      questionTimeLimit?: number;
      adaptiveMode?: boolean;
    },
  ): void;
  setLanguage(language: string): void;
  /** Signal that the media preview image has finished loading (or failed) on the TV display. */
  notifyMediaLoaded(success?: boolean, questionId?: string): void;
  readonly invitationToken?: string | null;
  cleanup(): void;
}
