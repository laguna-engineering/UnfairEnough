import { colors, ScreenBackground } from '@unfairenough/ui';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { useGameState } from '../hooks/useGameState';
import { getDeviceId, initDeviceId } from '../services/deviceId';
import { CountdownScreen } from './CountdownScreen';
import { GameOverScreen } from './GameOverScreen';
import { JoinScreen } from './JoinScreen';
import { MediaPreviewScreen } from './MediaPreviewScreen';
import { PlayScreen } from './PlayScreen';
import { ProfilePickerScreen } from './ProfilePickerScreen';
import { ResultScreen } from './ResultScreen';
import { ScanScreen } from './ScanScreen';
import { WaitingScreen } from './WaitingScreen';
import { WelcomeBackScreen } from './WelcomeBackScreen';

export const GameScreen: React.FC = () => {
  const {
    phase,
    connectionState,
    playerInfo,
    identifiedProfile,
    availableProfiles,
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
    confirmIdentity,
    claimProfile,
    rejectIdentity,
    goToJoin,
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

  // Web: auto-connect when loaded with ?roomCode= in the URL
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('roomCode');
    if (roomCode) {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      connect(`${wsProtocol}//${window.location.host}/ws?role=player&roomCode=${roomCode}`);
    }
  }, [connect]);

  switch (phase) {
    case 'SCAN':
      return <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />;

    case 'IDENTIFYING':
      return (
        <ScreenBackground style={{ justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </ScreenBackground>
      );

    case 'WELCOME_BACK':
      if (!identifiedProfile)
        return <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />;
      return (
        <WelcomeBackScreen
          profile={identifiedProfile}
          onConfirm={confirmIdentity}
          onReject={rejectIdentity}
        />
      );

    case 'PICK_PROFILE':
      return (
        <ProfilePickerScreen
          profiles={availableProfiles}
          onPickProfile={claimProfile}
          onPlayAsGuest={goToJoin}
          error={error}
        />
      );

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
