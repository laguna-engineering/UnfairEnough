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
    (
      gameType: 'casual' | 'configured' | 'personalized',
      questionSetId?: string,
      options?: {
        tags?: string[];
        totalQuestions?: number;
        questionTimeLimit?: number;
        adaptiveMode?: boolean;
      },
    ) => {
      controller.configureGame(gameType, questionSetId, options);
    },
    [controller],
  );

  const setLanguage = useCallback(
    (language: string) => {
      controller.setLanguage(language);
    },
    [controller],
  );

  const notifyMediaLoaded = useCallback(
    (success?: boolean, questionId?: string) => {
      controller.notifyMediaLoaded(success, questionId);
    },
    [controller],
  );

  // Build the QR URL based on mode
  const { roomCode, localIp, serverPort } = state.game;
  let qrUrl: string | null = null;
  if (mode === 'local') {
    qrUrl = localIp && serverPort ? `ws://${localIp}:${serverPort}` : null;
  } else if (mode === 'hosted' && serverUrl && roomCode) {
    const isSecure = /^https:\/\/|^wss:\/\//.test(serverUrl);
    const rawHost = serverUrl
      .replace(/^wss?:\/\//, '')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    const host = rawHost;
    const proto = isSecure ? 'https' : 'http';
    // Include invitation token in QR URL if available (for guest linking)
    const inviteParam = controller.invitationToken ? `&invite=${controller.invitationToken}` : '';
    const isLan = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host);
    if (isLan && mobileBaseUrl) {
      qrUrl = `${mobileBaseUrl}/?roomCode=${roomCode}&server=${encodeURIComponent(host)}${inviteParam}`;
    } else {
      qrUrl = `${proto}://${host}/mobile/?roomCode=${roomCode}${inviteParam}`;
    }
  }

  return {
    state,
    startGame,
    resetGame,
    configureGame,
    setLanguage,
    notifyMediaLoaded,
    mode: mode as GameMode,
    qrUrl,
    serverUrl,
    phase: state.game.phase as GamePhase,
    roomCode: state.game.roomCode,
    serverPort: state.game.serverPort,
    localIp: state.game.localIp,
    countdown: state.game.countdown,
    mediaPreview: state.game.mediaPreview,
    currentQuestion: state.game.currentQuestion,
    roundResults: state.game.roundResults,
    roundTags: state.game.roundTags,
    rankings: state.game.rankings,
    positionHistory: state.game.positionHistory,
    gameConfig: state.game.config,
  };
}
