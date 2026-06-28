import {
  DarkTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, ScreenBackground } from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { type MobileGamePhase, useGameState } from '../hooks/useGameState';
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

type MobileStackParamList = {
  Scan: undefined;
  Returning: undefined;
  Identifying: undefined;
  WelcomeBack: undefined;
  ProfilePicker: undefined;
  Join: undefined;
  Game: undefined;
};

type MobileRoute = { name: keyof MobileStackParamList };

const Stack = createNativeStackNavigator<MobileStackParamList>();

const PRE_GAME_MODAL_PHASES = new Set<MobileGamePhase>([
  'RETURNING',
  'IDENTIFYING',
  'WELCOME_BACK',
  'PICK_PROFILE',
  'JOIN',
]);

function routesForPhase(phase: MobileGamePhase): MobileRoute[] {
  switch (phase) {
    case 'RETURNING':
      return [{ name: 'Scan' }, { name: 'Returning' }];
    case 'IDENTIFYING':
      return [{ name: 'Scan' }, { name: 'Identifying' }];
    case 'WELCOME_BACK':
      return [{ name: 'Scan' }, { name: 'WelcomeBack' }];
    case 'PICK_PROFILE':
      return [{ name: 'Scan' }, { name: 'ProfilePicker' }];
    case 'JOIN':
      return [{ name: 'Scan' }, { name: 'Join' }];
    case 'SCAN':
      return [{ name: 'Scan' }];
    default:
      return [{ name: 'Game' }];
  }
}

function routeSignature(routes: MobileRoute[]): string {
  return routes.map((route) => route.name).join('|');
}

export const GameScreen: React.FC = () => {
  const navigationRef = useNavigationContainerRef<MobileStackParamList>();
  const [navigationReady, setNavigationReady] = useState(false);
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
    connect,
    connectFromSession,
    disconnectFromHost,
    cancelToScan,
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

  const navigationTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.textPrimary,
        border: 'transparent',
      },
    }),
    [],
  );

  const modalScreenOptions = useMemo(
    () => ({
      presentation: 'modal' as const,
      headerStyle: { backgroundColor: colors.background },
      headerShadowVisible: false,
      headerTintColor: colors.primary,
      headerTitle: '',
      contentStyle: { backgroundColor: colors.background },
    }),
    [],
  );

  // Load deviceId, check stored session, then auto-connect on web if roomCode is in the URL.
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
      // Check for stored session (returning user).
      checkStoredSession();
    });
  }, [connect, checkStoredSession]);

  useEffect(() => {
    if (!navigationReady) return;

    const routes = routesForPhase(phase);
    const currentState = navigationRef.getRootState();
    const currentRoutes = currentState?.routes.map((route) => ({ name: route.name }));

    if (
      currentRoutes &&
      routeSignature(currentRoutes as MobileRoute[]) === routeSignature(routes)
    ) {
      return;
    }

    navigationRef.resetRoot({
      index: routes.length - 1,
      routes,
    });
  }, [navigationReady, navigationRef, phase]);

  const handleNavigationStateChange = useCallback(
    (state?: ReturnType<typeof navigationRef.getRootState>) => {
      const activeRoute = state?.routes[state.index]?.name;
      if (activeRoute === 'Scan' && PRE_GAME_MODAL_PHASES.has(phase)) {
        cancelToScan();
      }
    },
    [cancelToScan, phase],
  );

  const renderIdentifyingScreen = () => (
    <ScreenBackground style={{ justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </ScreenBackground>
  );

  const renderGamePhase = () => {
    switch (phase) {
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
        return <WaitingScreen playerInfo={playerInfo} onLanguageChange={setLanguageOverride} />;
    }
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => setNavigationReady(true)}
      onStateChange={handleNavigationStateChange}
    >
      <Stack.Navigator
        initialRouteName="Scan"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Scan">
          {() => <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />}
        </Stack.Screen>

        <Stack.Screen name="Game">{renderGamePhase}</Stack.Screen>

        <Stack.Group screenOptions={modalScreenOptions}>
          <Stack.Screen name="Returning">
            {() =>
              storedSession ? (
                <ReturningUserScreen
                  session={storedSession}
                  error={returningError}
                  onPlay={() => connectFromSession(storedSession)}
                  onDisconnect={disconnectFromHost}
                />
              ) : (
                <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />
              )
            }
          </Stack.Screen>

          <Stack.Screen name="Identifying">{renderIdentifyingScreen}</Stack.Screen>

          <Stack.Screen name="WelcomeBack">
            {() =>
              identifiedProfile ? (
                <WelcomeBackScreen
                  profile={identifiedProfile}
                  onConfirm={confirmIdentity}
                  onReject={rejectIdentity}
                />
              ) : (
                <ScanScreen onConnect={connect} onLanguageChange={setLanguageOverride} />
              )
            }
          </Stack.Screen>

          <Stack.Screen name="ProfilePicker">
            {() => (
              <ProfilePickerScreen
                profiles={availableProfiles}
                onPickProfile={claimProfile}
                onPlayAsGuest={goToJoin}
                error={error}
              />
            )}
          </Stack.Screen>

          <Stack.Screen name="Join">
            {() => (
              <JoinScreen
                onJoin={(name: string) => join(name, undefined, getDeviceId() ?? undefined)}
                isConnecting={connectionState === 'connecting'}
                error={error}
              />
            )}
          </Stack.Screen>
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
};
