import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import type { ConfigPlugin } from 'expo/config-plugins';
import {
  AndroidConfig,
  withAndroidColors,
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
  withMainActivity,
} from 'expo/config-plugins';

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

/** Allow plain ws:// / http:// connections to local servers. */
const withCleartextTraffic: ConfigPlugin<void> = (cfg) =>
  withAndroidManifest(cfg, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });

/** Replace expo-splash-screen with our custom TvSplashScreen overlay. */
const withTvSplashScreen: ConfigPlugin<void> = (cfg) => {
  // 1. Inject TvSplashScreenManager into MainActivity
  cfg = withMainActivity(cfg, (mod) => {
    const importLine = 'import expo.modules.tvsplashscreen.TvSplashScreenManager';
    const registerCall = '    TvSplashScreenManager.registerOnActivity(this)';
    let contents = mod.modResults.contents;

    if (!contents.includes(importLine)) {
      contents = contents.replace(/^(package .+\n)/m, `$1${importLine}\n`);
    }
    // Place after super.onCreate so overlay goes on top of RN root view
    if (!contents.includes('TvSplashScreenManager.registerOnActivity')) {
      contents = contents.replace(/(super\.onCreate\(.*?\))/, `$1\n${registerCall}`);
    }

    mod.modResults.contents = contents;
    return mod;
  });

  // 2. Change activity theme from Theme.App.SplashScreen to AppTheme
  cfg = withAndroidManifest(cfg, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    const activity = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (activity) {
      activity.$['android:theme'] = '@style/AppTheme';
    }
    return mod;
  });

  // 3. Fix styles.xml: remove Theme.App.SplashScreen, add windowBackground to AppTheme
  cfg = withAndroidStyles(cfg, (mod) => {
    const styles = mod.modResults;

    // Remove Theme.App.SplashScreen style group
    styles.resources.style = (styles.resources.style ?? []).filter(
      (s) => s.$.name !== 'Theme.App.SplashScreen',
    );

    // Ensure windowBackground is set on AppTheme
    AndroidConfig.Styles.setStylesItem({
      item: { $: { name: 'android:windowBackground' }, _: '@color/splashscreen_background' },
      xml: styles,
      parent: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
    });

    // Fix statusBarColor
    AndroidConfig.Styles.setStylesItem({
      item: { $: { name: 'android:statusBarColor' }, _: '#aed8ff' },
      xml: styles,
      parent: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
    });

    return mod;
  });

  // 4. Copy splash.png into drawable-*dpi as splashscreen_logo
  cfg = withDangerousMod(cfg, [
    'android',
    (mod) => {
      const src = resolve(__dirname, 'assets/images/splash.png');
      const resDir = resolve(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      // Source is 1810×1080. Scale to density buckets based on 800dp base width.
      const buckets: [string, number][] = [
        ['drawable-mdpi', 800],
        ['drawable-hdpi', 1200],
        ['drawable-xhdpi', 1600],
        ['drawable-xxhdpi', 1810],
        ['drawable-xxxhdpi', 1810],
      ];
      for (const [dir, width] of buckets) {
        const outDir = resolve(resDir, dir);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        const outFile = resolve(outDir, 'splashscreen_logo.png');
        execSync(`sips --resampleWidth ${width} "${src}" --out "${outFile}"`, { stdio: 'ignore' });
      }
      return mod;
    },
  ]);

  // 5. Fix colors.xml: ensure splashscreen_background is #aed8ff (not white)
  cfg = withAndroidColors(cfg, (mod) => {
    AndroidConfig.Colors.setColorItem(
      { $: { name: 'splashscreen_background' }, _: '#aed8ff' },
      mod.modResults,
    );
    AndroidConfig.Colors.setColorItem(
      { $: { name: 'colorPrimaryDark' }, _: '#aed8ff' },
      mod.modResults,
    );
    return mod;
  });

  return cfg;
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Unfair Enough!',
  slug: 'unfairenough-tv',
  scheme: 'unfairenough-tv',
  version: '1.0.0',
  orientation: 'landscape',
  icon: './assets/images/icon-800x480.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  plugins: [
    [withCleartextTraffic],
    [withTvSplashScreen],
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
  },
  ios: {
    bundleIdentifier: 'com.unfairenough.tvhost',
  },
  extra: {
    defaultLang: env.DEFAULT_LANG || 'en',
    serverUrl: env.SERVER_URL || '',
  },
});
