import { MAX_RECENT_SERVERS, RECENT_SERVERS_STORAGE_KEY } from '@unfairenough/shared';
import { Platform } from 'react-native';

let cached: string[] = [];

async function getFromStorage(): Promise<string[]> {
  try {
    let raw: string | null;
    if (Platform.OS === 'web') {
      raw = localStorage.getItem(RECENT_SERVERS_STORAGE_KEY);
    } else {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      raw = await AsyncStorage.getItem(RECENT_SERVERS_STORAGE_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string');
    }
  } catch {
    // Storage read failed
  }
  return [];
}

async function saveToStorage(servers: string[]): Promise<void> {
  const raw = JSON.stringify(servers);
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(RECENT_SERVERS_STORAGE_KEY, raw);
    } catch {
      // localStorage may be unavailable
    }
    return;
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(RECENT_SERVERS_STORAGE_KEY, raw);
}

export async function initRecentServers(): Promise<string[]> {
  if (cached.length > 0) return cached;
  cached = await getFromStorage();
  return cached;
}

export function getRecentServers(): string[] {
  return cached;
}

export async function addRecentServer(address: string): Promise<void> {
  const trimmed = address.trim();
  if (!trimmed) return;
  cached = [trimmed, ...cached.filter((s) => s !== trimmed)].slice(0, MAX_RECENT_SERVERS);
  saveToStorage(cached).catch(() => {});
}
