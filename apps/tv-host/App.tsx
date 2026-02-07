import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Sniglet_400Regular } from '@expo-google-fonts/sniglet/400Regular';
import { useFonts } from '@expo-google-fonts/sniglet/useFonts';
import { StatusBar } from 'expo-status-bar';
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { GameModeProvider } from './src/context/GameModeContext';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ModeSelectionScreen } from './src/screens/ModeSelectionScreen';
import { gameController } from './src/services/GameController';
import { HostedGameController } from './src/services/HostedGameController';
import type { IGameController } from './src/services/IGameController';
import '@unfairenough/i18n';

type AppScreen = 'mode_select' | 'local_game' | 'connect' | 'hosted_game';

export default function App() {
  const [fontsLoaded] = useFonts({
    Sniglet_400Regular,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  const [screen, setScreen] = useState<AppScreen>('mode_select');
  const [hostedServerUrl, setHostedServerUrl] = useState<string>('');
  const hostedControllerRef = useRef<HostedGameController | null>(null);

  const handleSelectLocal = useCallback(() => {
    setScreen('local_game');
  }, []);

  const handleSelectHosted = useCallback(() => {
    setScreen('connect');
  }, []);

  const handleConnected = useCallback((serverUrl: string) => {
    setHostedServerUrl(serverUrl);

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
    setScreen('mode_select');
  }, []);

  if (!fontsLoaded) return null;

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

    case 'local_game':
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

    case 'hosted_game':
      controller = hostedControllerRef.current!;
      content = <GameScreen />;
      return (
        <>
          <StatusBar style="light" hidden />
          <GameModeProvider mode="hosted" controller={controller} serverUrl={hostedServerUrl}>
            {content}
          </GameModeProvider>
        </>
      );
  }
}
