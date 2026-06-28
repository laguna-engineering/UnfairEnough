/**
 * Device ID Service
 * Generates and persists a unique device identifier for player profile matching.
 * Uses AsyncStorage on native and localStorage on web.
 */

import { debugLog } from '@unfairenough/shared';
import { Platform } from 'react-native';

const STORAGE_KEY = 'unfairenough_device_id';

let cachedDeviceId: string | null = null;

function generateUUID(): string {
  // crypto.randomUUID() requires a secure context (HTTPS) on web.
  // Fall back to crypto.getRandomValues() which works over plain HTTP.
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // React Native may not provide global crypto in all runtimes. This ID is
  // persisted and used for profile matching, not security-sensitive auth.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = Math.floor(Math.random() * 16);
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  if (cachedDeviceId) {
    debugLog('[device-id] using cached device id');
    return cachedDeviceId;
  }

  try {
    const stored = await getFromStorage();
    if (stored) {
      cachedDeviceId = stored;
      debugLog('[device-id] loaded stored device id');
      return stored;
    }
  } catch (error) {
    debugLog('[device-id] storage read failed, generating new id', error);
  }

  const newId = generateUUID();
  cachedDeviceId = newId;
  debugLog('[device-id] generated new device id');

  // Persist in the background — don't block on this
  saveToStorage(newId).catch((error) => {
    debugLog('[device-id] storage write failed', error);
  });

  return newId;
}

/**
 * Get the cached device ID synchronously.
 * Returns null if initDeviceId() hasn't been called yet.
 */
export function getDeviceId(): string | null {
  return cachedDeviceId;
}

/**
 * Clear the current device ID and generate a fresh one.
 * Used for "Not me" / logout — dissociates the device from its profile.
 */
export async function clearDeviceId(): Promise<string> {
  const newId = generateUUID();
  cachedDeviceId = newId;
  await saveToStorage(newId);
  return newId;
}
