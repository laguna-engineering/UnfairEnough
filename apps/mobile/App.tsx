import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Sniglet_400Regular } from '@expo-google-fonts/sniglet/400Regular';
import { useFonts } from '@expo-google-fonts/sniglet/useFonts';
import { changeLanguage, type SupportedLanguage } from '@unfairenough/i18n';
import { setDebugEnabled } from '@unfairenough/shared';
import { colors } from '@unfairenough/ui';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GameScreen } from './src/screens/GameScreen';
import '@unfairenough/i18n';

const defaultLang = Constants.expoConfig?.extra?.defaultLang;
if (defaultLang) changeLanguage(defaultLang as SupportedLanguage);

// Debug logging: on in dev, or in any build with EXPO_PUBLIC_UE_DEBUG=1.
setDebugEnabled(__DEV__ || process.env.EXPO_PUBLIC_UE_DEBUG === '1');

export default function App() {
  const [fontsLoaded] = useFonts({
    Sniglet_400Regular,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <GameScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
