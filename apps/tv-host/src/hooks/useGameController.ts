import { useEffect, useState, useCallback } from 'react';
import { useGameMode, type GameMode } from '../context/GameModeContext';
import type { RootState, GamePhase } from '@unfairenough/game-logic';

export function useGameController() {
  const { mode, controller, serverUrl } = useGameMode();
  const [state, setState] = useState<RootState>(controller.getState());

  useEffect(() => {
    controller.initialize();

    const unsubscribe = controller.subscribe(() => {
      setState(controller.getState());
    });

    return () => {
      unsubscribe();
    };
  }, [controller]);

  const startGame = useCallback(() => {
    controller.startGame();
  }, [controller]);

  const resetGame = useCallback(() => {
    controller.reset();
  }, [controller]);

  const configureGame = useCallback((gameType: 'casual' | 'configured', questionSetId?: string) => {
    controller.configureGame(gameType, questionSetId);
  }, [controller]);

  const setLanguage = useCallback((language: string) => {
    controller.setLanguage(language);
  }, [controller]);

  // Build the QR URL based on mode
  const { roomCode, localIp, serverPort } = state.game;
  let qrUrl: string | null = null;
  if (mode === 'local') {
    qrUrl = localIp && serverPort ? `ws://${localIp}:${serverPort}` : null;
  } else if (mode === 'hosted' && serverUrl && roomCode) {
    // Strip ws:// prefix if present, ensure http://
    const httpUrl = serverUrl.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
    qrUrl = `http://${httpUrl}?roomCode=${roomCode}`;
  }

  return {
    state,
    startGame,
    resetGame,
    configureGame,
    setLanguage,
    mode: mode as GameMode,
    qrUrl,
    phase: state.game.phase as GamePhase,
    roomCode: state.game.roomCode,
    serverPort: state.game.serverPort,
    localIp: state.game.localIp,
    countdown: state.game.countdown,
    currentQuestion: state.game.currentQuestion,
    roundResults: state.game.roundResults,
    rankings: state.game.rankings,
    positionHistory: state.game.positionHistory,
    gameConfig: state.game.config,
  };
}
