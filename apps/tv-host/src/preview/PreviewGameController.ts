import {
  createStore,
  type GamePhase,
  type RootState,
  updateConfig,
} from '@unfairenough/game-logic';
import { changeLanguage, type SupportedLanguage } from '@unfairenough/i18n';
import type { IGameController } from '../services/IGameController';
import { buildPreviewState, type PreviewOptions } from './previewData';

export class PreviewGameController implements IGameController {
  private store;

  constructor(phase: GamePhase, options: PreviewOptions = {}) {
    this.store = createStore(buildPreviewState(phase, options));
  }

  async initialize(): Promise<void> {
    // No-op — state is preloaded
  }

  getState(): RootState {
    return this.store.getState();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  startGame(): void {
    // No-op
  }

  reset(): void {
    // No-op
  }

  configureGame(gameType: 'casual' | 'configured', questionSetId?: string): void {
    this.store.dispatch(updateConfig({ gameType, questionSetId }));
  }

  setLanguage(language: string): void {
    changeLanguage(language as SupportedLanguage);
  }

  notifyMediaLoaded(_success?: boolean, _questionId?: string): void {
    // No-op
  }

  cleanup(): void {
    // No-op
  }
}
