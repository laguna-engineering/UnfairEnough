/**
 * Persists TV host authentication state across app restarts.
 * Uses AsyncStorage (native) / localStorage (web).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'unfairenough_tv_auth';

export interface TvAuthState {
  sessionToken: string;
  serverUrl: string;
  hostDisplayName: string;
  hostId: string;
}

let cached: TvAuthState | null = null;

export async function loadAuthState(): Promise<TvAuthState | null> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw);
      return cached;
    }
  } catch {
    // Storage error — treat as no auth
  }
  return null;
}

export async function saveAuthState(state: TvAuthState): Promise<void> {
  cached = state;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save auth state:', err);
  }
}

export async function clearAuthState(): Promise<void> {
  cached = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear auth state:', err);
  }
}
