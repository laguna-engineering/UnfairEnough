import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { useFonts } from '@expo-google-fonts/fredoka/useFonts';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import type { GamePhase } from '@unfairenough/game-logic';
import { changeLanguage, type SupportedLanguage } from '@unfairenough/i18n';
import { setDebugEnabled } from '@unfairenough/shared';
import type { QuestionType } from '@unfairenough/ws-protocol';
import Constants from 'expo-constants';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as SplashScreen from './modules/tv-splash-screen/src';
import { GameModeProvider } from './src/context/GameModeContext';
import type { PreviewOptions } from './src/preview/previewData';
import { AccountLoginScreen } from './src/screens/AccountLoginScreen';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ModeSelectionScreen } from './src/screens/ModeSelectionScreen';
import { clearAuthState, loadAuthState, saveAuthState } from './src/services/AuthService';
import type { AuthChallenge } from './src/services/HostedGameController';
import { HostedGameController } from './src/services/HostedGameController';
import type { IGameController } from './src/services/IGameController';
import '@unfairenough/i18n';

const defaultLang = Constants.expoConfig?.extra?.defaultLang;
if (defaultLang) changeLanguage(defaultLang as SupportedLanguage);

const configServerUrl: string = Constants.expoConfig?.extra?.serverUrl || '';

// Debug logging: on in dev, or in any build with EXPO_PUBLIC_UE_DEBUG=1.
setDebugEnabled(__DEV__ || process.env.EXPO_PUBLIC_UE_DEBUG === '1');

SplashScreen.preventAutoHideAsync();

const MAX_AUTH_RETRIES = 3;

const VALID_PREVIEW_PHASES: GamePhase[] = [
  'LOBBY',
  'COUNTDOWN',
  'MEDIA_PREVIEW',
  'QUESTION',
  'REVEALING',
  'RESULTS',
  'GAME_OVER',
];

const VALID_PREVIEW_QUESTION_TYPES: QuestionType[] = [
  'multiple_choice',
  'true_false',
  'closest_wins',
  'predict_room',
];

/**
 * Layout knobs shared by both preview entry points (web query string, Android
 * TV intent URI): `players`, `type` and `answered` pin down the exact room the
 * screens render — see PreviewOptions.
 */
function parsePreviewOptions(params: URLSearchParams): PreviewOptions {
  const players = Number.parseInt(params.get('players') ?? '', 10);
  const answered = Number.parseInt(params.get('answered') ?? '', 10);
  const questionType = params.get('type') as QuestionType | null;

  return {
    players: Number.isFinite(players) ? players : undefined,
    answered: Number.isFinite(answered) ? answered : undefined,
    questionType:
      questionType && VALID_PREVIEW_QUESTION_TYPES.includes(questionType)
        ? questionType
        : undefined,
  };
}

// A stand-in host for preview mode: the lobby needs *some* server to build the
// join QR from, and no request is ever made to it (the preview controller has
// no socket). Override with `?server=`.
const PREVIEW_SERVER_URL = 'preview.local';

function parseLang(params: URLSearchParams): SupportedLanguage | null {
  const lang = params.get('lang');
  return lang === 'en' || lang === 'it' ? lang : null;
}

/**
 * `?lang=en|it` on the web dev build. The app language otherwise comes from the
 * build-time DEFAULT_LANG, which makes screenshots and e2e assertions depend on
 * whoever's .env built the bundle; this pins it per URL.
 */
function getUrlLang(): SupportedLanguage | null {
  if (!__DEV__ || Platform.OS !== 'web') return null;
  return parseLang(new URLSearchParams(window.location.search));
}

function getWebPreview(): {
  phase: GamePhase;
  options: PreviewOptions;
  serverUrl: string;
} | null {
  if (!__DEV__ || Platform.OS !== 'web') return null;
  const params = new URLSearchParams(window.location.search);
  const phase = params.get('preview') as GamePhase | null;
  if (!phase || !VALID_PREVIEW_PHASES.includes(phase)) return null;
  return {
    phase,
    options: parsePreviewOptions(params),
    serverUrl: params.get('server') || PREVIEW_SERVER_URL,
  };
}

type AppScreen =
  | 'mode_select'
  | 'account_login'
  | 'local_game'
  | 'connect'
  | 'hosted_game'
  | 'preview';

export default function App() {
  // Keep the display on so the Android TV system screensaver / daydream never
  // kicks in while the game is running (applies FLAG_KEEP_SCREEN_ON on Android).
  useKeepAwake();

  const [fontsLoaded] = useFonts({
    Fredoka_600SemiBold,
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

  const webPreview = getWebPreview();
  const urlLang = getUrlLang();
  useEffect(() => {
    if (urlLang) changeLanguage(urlLang);
  }, [urlLang]);

  const [screen, setScreen] = useState<AppScreen>(
    webPreview ? 'preview' : Platform.OS === 'web' ? 'connect' : 'mode_select',
  );
  const [previewServerUrl, setPreviewServerUrl] = useState<string>(
    webPreview?.serverUrl ?? PREVIEW_SERVER_URL,
  );
  const [hostedServerUrl, setHostedServerUrl] = useState<string>('');
  // Web has no mode select to pass through (it can't run a local server), so it lands
  // straight on the connect screen — seed the .env server there the way
  // handleSelectAccount does for native, or the host is left typing a URL by hand.
  const [connectDefaultUrl, setConnectDefaultUrl] = useState<string | null>(
    Platform.OS === 'web' ? configServerUrl || null : null,
  );
  const [hostedMobileBaseUrl, setHostedMobileBaseUrl] = useState<string | null>(null);
  const hostedControllerRef = useRef<HostedGameController | null>(null);
  const [authChallenge, setAuthChallenge] = useState<AuthChallenge | null>(null);
  const [authLoginState, setAuthLoginState] = useState<
    'connecting' | 'waiting' | 'expired' | 'approved' | 'failed'
  >('connecting');
  const authRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRetryCountRef = useRef(0);
  const previewControllerRef = useRef<IGameController | null>(
    webPreview
      ? new (require('./src/preview/PreviewGameController').PreviewGameController)(
          webPreview.phase,
          webPreview.options,
        )
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
          previewControllerRef.current = new PreviewGameController(
            phase,
            parsePreviewOptions(parsed.searchParams),
          );
          const lang = parseLang(parsed.searchParams);
          if (lang) changeLanguage(lang);
          setPreviewServerUrl(parsed.searchParams.get('server') || PREVIEW_SERVER_URL);
          setScreen('preview');
        }
      } catch {
        // Not a valid URL — ignore
      }
    });
  }, []);

  // Auto-connect if stored auth exists
  useEffect(() => {
    if (Platform.OS === 'web') return; // Web goes straight to connect
    loadAuthState().then((auth) => {
      if (auth) {
        // Have stored credentials — connect as authenticated host
        setHostedServerUrl(auth.serverUrl);
        hostedControllerRef.current?.cleanup();
        hostedControllerRef.current = new HostedGameController(auth.serverUrl, {
          onRoomCreated: () => setScreen('hosted_game'),
          sessionToken: auth.sessionToken,
          onSessionInvalid: () => {
            // Session expired or revoked — clear stored auth and go to login
            hostedControllerRef.current?.cleanup();
            hostedControllerRef.current = null;
            clearAuthState();
            setScreen('mode_select');
          },
        });
        hostedControllerRef.current.initialize();
      }
    });
  }, []);

  // Tear down the hosted controller when App unmounts (e.g. a Fast Refresh
  // remount) so its socket can't keep reconnecting and spawning duplicate rooms.
  useEffect(() => {
    return () => {
      hostedControllerRef.current?.cleanup();
      hostedControllerRef.current = null;
    };
  }, []);

  // Account mode goes through the connect screen like hosted mode, but offers
  // the .env-configured server (extra.serverUrl) as a one-click default option.
  const handleSelectAccount = useCallback(() => {
    setConnectDefaultUrl(configServerUrl || null);
    setScreen('connect');
  }, []);

  const handleSelectLocal = useCallback(() => {
    setScreen('local_game');
  }, []);

  const handleSelectHosted = useCallback(() => {
    setConnectDefaultUrl(null);
    setScreen('connect');
  }, []);

  const handleConnected = useCallback((serverUrl: string, mobileBaseUrl: string | null) => {
    setHostedServerUrl(serverUrl);
    setHostedMobileBaseUrl(mobileBaseUrl);
    setAuthChallenge(null);
    setAuthLoginState('connecting');
    authRetryCountRef.current = 0;

    // Clean up previous hosted controller if any
    hostedControllerRef.current?.cleanup();

    hostedControllerRef.current = new HostedGameController(serverUrl, {
      onRoomCreated: () => setScreen('hosted_game'),
      onAuthChallenge: (challenge) => {
        setAuthChallenge(challenge);
        setAuthLoginState('waiting');
      },
      onAuthSuccess: (sessionToken, hostId, displayName) => {
        setAuthLoginState('approved');
        saveAuthState({
          sessionToken,
          serverUrl,
          hostDisplayName: displayName,
          hostId,
        });
      },
      onAuthFailed: () => setAuthLoginState('failed'),
      onAuthExpired: () => {
        authRetryCountRef.current += 1;
        if (authRetryCountRef.current >= MAX_AUTH_RETRIES) {
          setAuthLoginState('failed');
          return;
        }
        setAuthLoginState('expired');
        authRetryTimeoutRef.current = setTimeout(() => {
          authRetryTimeoutRef.current = null;
          hostedControllerRef.current?.cleanup();
          handleConnected(serverUrl, mobileBaseUrl);
        }, 1500);
      },
    });
    hostedControllerRef.current.initialize();
    setScreen('account_login');
  }, []);

  const handleBack = useCallback(() => {
    if (authRetryTimeoutRef.current) {
      clearTimeout(authRetryTimeoutRef.current);
      authRetryTimeoutRef.current = null;
    }
    authRetryCountRef.current = 0;
    hostedControllerRef.current?.cleanup();
    hostedControllerRef.current = null;
    clearAuthState();
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
            onSelectAccount={handleSelectAccount}
            onSelectLocal={handleSelectLocal}
            onSelectHosted={handleSelectHosted}
          />
        </>
      );

    case 'account_login':
      return (
        <>
          <StatusBar style="light" hidden />
          <AccountLoginScreen
            challenge={authChallenge}
            loginState={authLoginState}
            onCancel={handleBack}
          />
        </>
      );

    case 'connect':
      return (
        <>
          <StatusBar style="light" hidden />
          <ConnectScreen
            onConnected={handleConnected}
            onBack={handleBack}
            defaultServerUrl={connectDefaultUrl ?? undefined}
          />
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
          <GameModeProvider
            mode="hosted"
            controller={previewControllerRef.current!}
            serverUrl={previewServerUrl}
          >
            <GameScreen />
          </GameModeProvider>
        </>
      );
  }
}
