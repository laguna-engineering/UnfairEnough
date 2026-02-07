/**
 * Device ID Service
 * Generates and persists a unique device identifier for player profile matching.
 * Uses AsyncStorage on native and localStorage on web.
 */

import { Platform } from 'react-native';

const STORAGE_KEY = 'unfairenough_device_id';

let cachedDeviceId: string | null = null;

function generateUUID(): string {
  // crypto.randomUUID() works in both React Native and web
  return crypto.randomUUID();
}

async function getFromStorage(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return AsyncStorage.getItem(STORAGE_KEY);
}

async function saveToStorage(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // localStorage may be unavailable in incognito
    }
    return;
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(STORAGE_KEY, value);
}

/**
 * Load or generate device ID. Call this early (e.g., on ScanScreen mount).
 * The result is cached in memory for synchronous access via getDeviceId().
 */
export async function initDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = await getFromStorage();
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
  } catch {
    // Storage read failed — generate a new ID
  }

  const newId = generateUUID();
  cachedDeviceId = newId;

  // Persist in the background — don't block on this
  saveToStorage(newId).catch(() => {});

  return newId;
}

/**
 * Get the cached device ID synchronously.
 * Returns null if initDeviceId() hasn't been called yet.
 */
export function getDeviceId(): string | null {
  return cachedDeviceId;
}
