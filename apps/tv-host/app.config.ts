import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

function loadRootEnv(): Record<string, string> {
  try {
    const content = readFileSync(resolve(__dirname, '../../.env'), 'utf-8');
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      vars[trimmed.slice(0, eqIndex).trim()] = trimmed
        .slice(eqIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadRootEnv();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Unfair Enough!',
  slug: 'unfairenough-tv',
  version: '1.0.0',
  orientation: 'landscape',
  icon: './assets/images/icon-800x480.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  plugins: [
    [
      '@react-native-tvos/config-tv',
      {
        androidTVBanner: './assets/images/icon-1920x720.png',
        appleTVImages: {
          icon: './assets/images/icon-1280x768.png',
          iconSmall: './assets/images/icon-400x240.png',
          iconSmall2x: './assets/images/icon-800x480.png',
          topShelf: './assets/images/icon-1920x720.png',
          topShelf2x: './assets/images/icon-3840x1440.png',
          topShelfWide: './assets/images/icon-2320x720.png',
          topShelfWide2x: './assets/images/icon-4640x1440.png',
        },
      },
    ],
  ],
  android: {
    package: 'com.unfairenough.tvhost',
    edgeToEdgeEnabled: true,
    splash: {
      image: './assets/images/icon-800x480.png',
      resizeMode: 'contain',
      backgroundColor: '#1a1a2e',
    },
  },
  ios: {
    bundleIdentifier: 'com.unfairenough.tvhost',
    splash: {
      backgroundColor: '#1a1a2e',
    },
  },
  extra: {
    defaultLang: env.DEFAULT_LANG || 'en',
  },
});
