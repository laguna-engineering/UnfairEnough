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
  slug: 'unfairenough-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'cover',
    backgroundColor: '#db4980',
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'Allow $(PRODUCT_NAME) to scan QR codes to join games',
      },
    ],
  ],
  android: {
    package: 'com.unfairenough.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundImage: './assets/adaptive-icon-bg.png',
    },
  },
  ios: {
    bundleIdentifier: 'com.unfairenough.mobile',
    supportsTablet: true,
  },
  extra: {
    defaultLang: env.DEFAULT_LANG || 'en',
  },
  // Serve the web export under a subpath (e.g. /mobile) so assets resolve when the server
  // hosts it there. Set only for the production export via rebuild-web.sh; left unset in
  // dev so `expo start` keeps serving at root.
  experiments: process.env.WEB_BASE_URL ? { baseUrl: process.env.WEB_BASE_URL } : undefined,
});
