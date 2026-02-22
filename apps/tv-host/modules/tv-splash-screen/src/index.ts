import { requireNativeModule } from 'expo-modules-core';

const TvSplashScreen = requireNativeModule('TvSplashScreen');

export async function preventAutoHideAsync(): Promise<void> {
  await TvSplashScreen.preventAutoHideAsync();
}

export async function hideAsync(): Promise<void> {
  await TvSplashScreen.hideAsync();
}
