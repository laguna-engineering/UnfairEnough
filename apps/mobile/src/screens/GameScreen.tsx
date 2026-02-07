import type React from 'react';
import { useEffect, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { getDeviceId, initDeviceId } from '../services/deviceId';
import { CountdownScreen } from './CountdownScreen';
import { GameOverScreen } from './GameOverScreen';
import { JoinScreen } from './JoinScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { PlayScreen } from './PlayScreen';
import { ResultScreen } from './ResultScreen';
import { ScanScreen } from './ScanScreen';
import { WaitingScreen } from './WaitingScreen';

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
