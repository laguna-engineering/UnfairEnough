import type { SupportedLanguage } from '@unfairenough/i18n';
import { LANGUAGE_STORAGE_KEY } from '@unfairenough/shared';
import { Platform } from 'react-native';

const SUPPORTED: readonly SupportedLanguage[] = ['en', 'it'];

let cached: SupportedLanguage | null = null;

function isSupported(value: string | null): value is SupportedLanguage {
  return value !== null && (SUPPORTED as readonly string[]).includes(value);
}

async function getFromStorage(): Promise<SupportedLanguage | null> {
  try {
    let raw: string | null;
    if (Platform.OS === 'web') {
      raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } else {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      raw = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    }
    return isSupported(raw) ? raw : null;
  } catch {
    // Storage read failed
    return null;
  }
}

async function saveToStorage(lang: SupportedLanguage): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // localStorage may be unavailable
    }
    return;
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

/** Load the persisted language choice (if any) into the in-memory cache. */
export async function initLanguagePreference(): Promise<SupportedLanguage | null> {
  cached = await getFromStorage();
  return cached;
}

export function getStoredLanguage(): SupportedLanguage | null {
  return cached;
}

export async function saveLanguagePreference(lang: SupportedLanguage): Promise<void> {
  cached = lang;
  saveToStorage(lang).catch(() => {});
}
