import type { GamePhase, RootState } from '@unfairenough/game-logic';
import { useCallback, useEffect, useState } from 'react';
import { type GameMode, useGameMode } from '../context/GameModeContext';

export function useGameController() {
  const { mode, controller, serverUrl, mobileBaseUrl } = useGameMode();
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

  const configureGame = useCallback(
    (gameType: 'casual' | 'configured', questionSetId?: string) => {
      controller.configureGame(gameType, questionSetId);
    },
    [controller],
  );

  const setLanguage = useCallback(
    (language: string) => {
      controller.setLanguage(language);
    },
    [controller],
  );

  // Build the QR URL based on mode
  const { roomCode, localIp, serverPort } = state.game;
  let qrUrl: string | null = null;
  if (mode === 'local') {
    qrUrl = localIp && serverPort ? `ws://${localIp}:${serverPort}` : null;
  } else if (mode === 'hosted' && serverUrl && roomCode) {
    const host = serverUrl.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
    if (mobileBaseUrl) {
      qrUrl = `${mobileBaseUrl}/?roomCode=${roomCode}&server=${encodeURIComponent(host)}`;
    } else {
      qrUrl = `http://${host}/mobile/?roomCode=${roomCode}`;
    }
  }

  return {
    state,
    startGame,
    resetGame,
    configureGame,
    setLanguage,
    mode: mode as GameMode,
    qrUrl,
    serverUrl,
    phase: state.game.phase as GamePhase,
    roomCode: state.game.roomCode,
    serverPort: state.game.serverPort,
    localIp: state.game.localIp,
    countdown: state.game.countdown,
    currentQuestion: state.game.currentQuestion,
    roundResults: state.game.roundResults,
    roundTags: state.game.roundTags,
    rankings: state.game.rankings,
    positionHistory: state.game.positionHistory,
    gameConfig: state.game.config,
  };
}
