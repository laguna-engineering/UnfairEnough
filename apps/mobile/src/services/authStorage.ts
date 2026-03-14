/**
 * Persistent storage for guest session (linking mobile device to a host account).
 * Uses AsyncStorage (native) / localStorage (web).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'unfairenough_guest_session';

export interface GuestSession {
  sessionToken: string;
  serverUrl: string;
  playerName: string;
  playerColor: string;
  playerEmoji?: string;
  hostDisplayName?: string;
}

let cached: GuestSession | null = null;

export async function getGuestSession(): Promise<GuestSession | null> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw);
      return cached;
    }
  } catch {
    // Storage error
  }
  return null;
}

export async function saveGuestSession(session: GuestSession): Promise<void> {
  cached = session;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save guest session:', err);
  }
}

export async function clearGuestSession(): Promise<void> {
  cached = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear guest session:', err);
  }
}

export function getCachedGuestSession(): GuestSession | null {
  return cached;
}
