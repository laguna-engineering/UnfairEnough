import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { useFonts } from '@expo-google-fonts/fredoka/useFonts';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { changeLanguage, type SupportedLanguage } from '@unfairenough/i18n';
import { setDebugEnabled } from '@unfairenough/shared';
import { colors } from '@unfairenough/ui';
import type { QuestionType } from '@unfairenough/ws-protocol';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  PREVIEW_SCREENS,
  PreviewScreen,
  type PreviewScreenName,
  type PreviewScreenOptions,
} from './src/preview/PreviewScreen';
import { GameScreen } from './src/screens/GameScreen';
import '@unfairenough/i18n';

// Native builds stay pinned to the language they were built for; on web the
// browser locale detected by the i18n init wins, since players bring their own.
const defaultLang = Constants.expoConfig?.extra?.defaultLang;
if (defaultLang && Platform.OS !== 'web') changeLanguage(defaultLang as SupportedLanguage);

const VALID_PREVIEW_QUESTION_TYPES: QuestionType[] = [
  'multiple_choice',
  'true_false',
  'closest_wins',
  'predict_room',
];

/**
 * `?preview=<SCREEN>` renders one screen with mock data (see PreviewScreen),
 * and `?lang=en|it` pins the language — otherwise the browser locale decides,
 * which makes screenshots and e2e assertions depend on the machine running
 * them. Web dev build only.
 */
function getWebPreview(): { screen: PreviewScreenName; options: PreviewScreenOptions } | null {
  if (!__DEV__ || Platform.OS !== 'web') return null;
  const params = new URLSearchParams(window.location.search);
  const screen = params.get('preview') as PreviewScreenName | null;
  if (!screen || !PREVIEW_SCREENS.includes(screen)) return null;

  const players = Number.parseInt(params.get('players') ?? '', 10);
  const questionType = params.get('type') as QuestionType | null;

  return {
    screen,
    options: {
      players: Number.isFinite(players) ? players : undefined,
      questionType:
        questionType && VALID_PREVIEW_QUESTION_TYPES.includes(questionType)
          ? questionType
          : undefined,
      answered: params.get('answered') === '1',
      categoryId: params.get('category') ?? undefined,
    },
  };
}

function getUrlLang(): SupportedLanguage | null {
  if (Platform.OS !== 'web') return null;
  const lang = new URLSearchParams(window.location.search).get('lang');
  return lang === 'en' || lang === 'it' ? lang : null;
}

// Debug logging: on in dev, or in any build with EXPO_PUBLIC_UE_DEBUG=1.
setDebugEnabled(__DEV__ || process.env.EXPO_PUBLIC_UE_DEBUG === '1');

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_600SemiBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  const preview = getWebPreview();
  const urlLang = getUrlLang();
  useEffect(() => {
    if (urlLang) changeLanguage(urlLang);
  }, [urlLang]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        {preview ? <PreviewScreen screen={preview.screen} {...preview.options} /> : <GameScreen />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
