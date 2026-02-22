import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Sniglet_400Regular } from '@expo-google-fonts/sniglet/400Regular';
import { useFonts } from '@expo-google-fonts/sniglet/useFonts';
import type { GamePhase } from '@unfairenough/game-logic';
import { changeLanguage, type SupportedLanguage } from '@unfairenough/i18n';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as SplashScreen from './modules/tv-splash-screen/src';
import { GameModeProvider } from './src/context/GameModeContext';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ModeSelectionScreen } from './src/screens/ModeSelectionScreen';
import { HostedGameController } from './src/services/HostedGameController';
import type { IGameController } from './src/services/IGameController';
import '@unfairenough/i18n';

const defaultLang = Constants.expoConfig?.extra?.defaultLang;
if (defaultLang) changeLanguage(defaultLang as SupportedLanguage);

SplashScreen.preventAutoHideAsync();

const VALID_PREVIEW_PHASES: GamePhase[] = [
  'LOBBY',
  'COUNTDOWN',
  'MEDIA_PREVIEW',
  'QUESTION',
  'REVEALING',
  'RESULTS',
  'GAME_OVER',
];

function getWebPreviewPhase(): GamePhase | null {
  if (!__DEV__ || Platform.OS !== 'web') return null;
  const params = new URLSearchParams(window.location.search);
  const phase = params.get('preview') as GamePhase | null;
  return phase && VALID_PREVIEW_PHASES.includes(phase) ? phase : null;
}

type AppScreen = 'mode_select' | 'local_game' | 'connect' | 'hosted_game' | 'preview';

export default function App() {
  const [fontsLoaded] = useFonts({
    Sniglet_400Regular,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashMinElapsed(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsLoaded && splashMinElapsed;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  const webPreviewPhase = getWebPreviewPhase();
  const [screen, setScreen] = useState<AppScreen>(
    webPreviewPhase ? 'preview' : Platform.OS === 'web' ? 'connect' : 'mode_select',
  );
  const [hostedServerUrl, setHostedServerUrl] = useState<string>('');
  const [hostedMobileBaseUrl, setHostedMobileBaseUrl] = useState<string | null>(null);
  const hostedControllerRef = useRef<HostedGameController | null>(null);
  const previewControllerRef = useRef<IGameController | null>(
    webPreviewPhase
      ? new (require('./src/preview/PreviewGameController').PreviewGameController)(webPreviewPhase)
      : null,
  );

  // Android TV: detect preview intent URI asynchronously
  useEffect(() => {
    if (!__DEV__ || Platform.OS === 'web') return;
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'preview') return;
        const phase = parsed.searchParams.get('phase') as GamePhase | null;
        if (phase && VALID_PREVIEW_PHASES.includes(phase)) {
          const { PreviewGameController } = require('./src/preview/PreviewGameController');
          previewControllerRef.current = new PreviewGameController(phase);
          setScreen('preview');
        }
      } catch {
        // Not a valid URL — ignore
      }
    });
  }, []);

  const handleSelectLocal = useCallback(() => {
    setScreen('local_game');
  }, []);

  const handleSelectHosted = useCallback(() => {
    setScreen('connect');
  }, []);

  const handleConnected = useCallback((serverUrl: string, mobileBaseUrl: string | null) => {
    setHostedServerUrl(serverUrl);
    setHostedMobileBaseUrl(mobileBaseUrl);

    // Clean up previous hosted controller if any
    hostedControllerRef.current?.cleanup();

    hostedControllerRef.current = new HostedGameController(serverUrl, {
      onRoomCreated: () => {
        setScreen('hosted_game');
      },
    });

    // Start connecting immediately — initialize is called when GameScreen mounts,
    // but we trigger it here to get the ROOM_CREATED callback before mount
    hostedControllerRef.current.initialize();
  }, []);

  const handleBack = useCallback(() => {
    hostedControllerRef.current?.cleanup();
    hostedControllerRef.current = null;
    setScreen(Platform.OS === 'web' ? 'connect' : 'mode_select');
  }, []);

  if (!ready) return null;

  let content: React.ReactNode;
  let controller: IGameController;

  switch (screen) {
    case 'mode_select':
      return (
        <>
          <StatusBar style="light" hidden />
          <ModeSelectionScreen
            onSelectLocal={handleSelectLocal}
            onSelectHosted={handleSelectHosted}
          />
        </>
      );

    case 'connect':
      return (
        <>
          <StatusBar style="light" hidden />
          <ConnectScreen onConnected={handleConnected} onBack={handleBack} />
        </>
      );

    case 'local_game': {
      // Lazy require to avoid loading react-native-tcp-socket on web
      const { gameController } = require('./src/services/GameController');
      controller = gameController;
      content = <GameScreen />;
      return (
        <>
          <StatusBar style="light" hidden />
          <GameModeProvider mode="local" controller={controller}>
            {content}
          </GameModeProvider>
        </>
      );
    }

    case 'hosted_game':
      controller = hostedControllerRef.current!;
      content = <GameScreen />;
      return (
        <>
          <StatusBar style="light" hidden />
          <GameModeProvider
            mode="hosted"
            controller={controller}
            serverUrl={hostedServerUrl}
            mobileBaseUrl={hostedMobileBaseUrl ?? undefined}
          >
            {content}
          </GameModeProvider>
        </>
      );

    case 'preview':
      return (
        <>
          <StatusBar style="light" hidden />
          <GameModeProvider mode="hosted" controller={previewControllerRef.current!}>
            <GameScreen />
          </GameModeProvider>
        </>
      );
  }
}
