import { colors, ScreenBackground } from '@unfairenough/ui';
import type React from 'react';
import { useEffect } from 'react';
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
import { ReturningUserScreen } from './ReturningUserScreen';
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
    storedSession,
    returningError,
    returningConnecting,
    connect,
    connectFromSession,
    disconnectFromHost,
    checkStoredSession,
    join,
    confirmIdentity,
    claimProfile,
    rejectIdentity,
    goToJoin,
    submitAnswer,
    reset,
    setLanguageOverride,
  } = useGameState();

  // Load deviceId, check stored session, then auto-connect on web if roomCode is in the URL
  useEffect(() => {
    initDeviceId().then(() => {
      if (Platform.OS === 'web') {
        const params = new URLSearchParams(window.location.search);
        const roomCode = params.get('roomCode');
        if (roomCode) {
          const serverHost = params.get('server') || window.location.host;
          const inviteToken = params.get('invite') || undefined;
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          connect(`${wsProtocol}//${serverHost}/ws?role=player&roomCode=${roomCode}`, inviteToken);
          return;
        }
      }
      // Check for stored session (returning user)
      checkStoredSession();
    });
  }, [connect, checkStoredSession]);

  switch (phase) {
    case 'RETURNING':
      if (!storedSession)
        return <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />;
      return (
        <ReturningUserScreen
          session={storedSession}
          isConnecting={returningConnecting}
          error={returningError}
          onPlay={() => connectFromSession(storedSession)}
          onDisconnect={disconnectFromHost}
        />
      );

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
          question={currentQuestion}
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
