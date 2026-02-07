import React, { useEffect, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { initDeviceId, getDeviceId } from '../services/deviceId';
import { ScanScreen } from './ScanScreen';
import { JoinScreen } from './JoinScreen';
import { WaitingScreen } from './WaitingScreen';
import { CountdownScreen } from './CountdownScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { GameOverScreen } from './GameOverScreen';

export const GameScreen: React.FC = () => {
  const {
    phase,
    connectionState,
    playerInfo,
    countdown,
    currentQuestion,
    timeRemaining,
    confirmedAnswer,
    roundResult,
    gameResult,
    mediaPreview,
    error,
    connect,
    join,
    submitAnswer,
    reset,
    setLanguageOverride,
  } = useGameState();

  const deviceIdReady = useRef(false);

  // Load deviceId early so it's available when the player joins
  useEffect(() => {
    initDeviceId().then(() => {
      deviceIdReady.current = true;
    });
  }, []);

  switch (phase) {
    case 'SCAN':
      return <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />;

    case 'JOIN':
      return (
        <JoinScreen
          onJoin={(name: string) => join(name, undefined, getDeviceId() ?? undefined)}
          isConnecting={connectionState === 'connecting'}
          error={error}
        />
      );

    case 'WAITING':
      return <WaitingScreen playerInfo={playerInfo} onLanguageChange={setLanguageOverride} />;

    case 'COUNTDOWN':
      return <CountdownScreen countdown={countdown} />;

    case 'MEDIA_PREVIEW':
      if (!mediaPreview) return <WaitingScreen playerInfo={playerInfo} />;
      return <MediaPreviewScreen mediaPreview={mediaPreview} />;

    case 'PLAYING':
    case 'ANSWERED':
      if (!currentQuestion) return <WaitingScreen playerInfo={playerInfo} />;
      return (
        <PlayScreen
          question={currentQuestion}
          timeRemaining={timeRemaining}
          confirmedAnswer={confirmedAnswer}
          onSubmitAnswer={submitAnswer}
        />
      );

    case 'RESULT':
      if (!roundResult || !playerInfo) return <WaitingScreen playerInfo={playerInfo} />;
      return (
        <ResultScreen
          result={roundResult}
          playerId={playerInfo.playerId}
          confirmedAnswer={confirmedAnswer}
        />
      );

    case 'GAME_OVER':
      if (!gameResult || !playerInfo) return <WaitingScreen playerInfo={playerInfo} />;
      return (
        <GameOverScreen
          result={gameResult}
          playerId={playerInfo.playerId}
          onPlayAgain={reset}
          totalGamesBefore={playerInfo.profile?.totalGames}
        />
      );

    default:
      return <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />;
  }
};
