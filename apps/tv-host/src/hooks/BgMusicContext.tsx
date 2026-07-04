import { createContext, type ReactNode, useContext } from 'react';
import { useBgMusic } from './useBgMusic';

type BgMusicApi = ReturnType<typeof useBgMusic>;

const BgMusicContext = createContext<BgMusicApi | null>(null);

/**
 * Mounts the single bundled-music player and shares its controls (mute + duck)
 * with any screen in the tree. Lifting `useBgMusic` into context lets non-Lobby
 * screens (media preview, question) pause the ambient track while question
 * audio plays without each mounting its own player.
 */
export function BgMusicProvider({ children }: { children: ReactNode }) {
  const bgMusic = useBgMusic();
  return <BgMusicContext.Provider value={bgMusic}>{children}</BgMusicContext.Provider>;
}

export function useBgMusicContext(): BgMusicApi {
  const ctx = useContext(BgMusicContext);
  if (!ctx) {
    throw new Error('useBgMusicContext must be used within a BgMusicProvider');
  }
  return ctx;
}
