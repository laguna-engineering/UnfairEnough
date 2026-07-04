import { createAudioPlayer } from 'expo-audio';
import { Image } from 'react-native';
import type { GameMode } from '../context/GameModeContext';
import { resolveMediaUrl } from './mediaUrl';

// Cap how long we wait for an audio file to buffer before treating the warm as
// done — best-effort, since the at-preview MEDIA_LOADED handshake is the backstop.
const AUDIO_WARM_TIMEOUT_MS = 6000;
// Image.prefetch has no built-in timeout; bound it so a hung request settles the
// warm attempt (and releases its closure) instead of leaking a pending promise.
const IMAGE_PREFETCH_TIMEOUT_MS = 6000;

/** Resolve (never reject) after the given delay so a warm task can't hang forever. */
function settleAfter(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Buffer an audio file in a short-lived player so the real playback starts warm. */
function warmAudio(url: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timeout) clearTimeout(timeout);
      player?.remove();
      resolve();
    };
    try {
      player = createAudioPlayer({ uri: url });
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded) {
          sub.remove();
          finish();
        }
      });
      timeout = setTimeout(() => {
        sub.remove();
        finish();
      }, AUDIO_WARM_TIMEOUT_MS);
    } catch {
      finish();
    }
  });
}

/**
 * Warm the next question's media (image via `Image.prefetch`, audio via a
 * buffering player) so playback starts without a stall. Best-effort: always
 * resolves `true` once the warm attempts settle, even on partial failure —
 * the caller uses this only to release the between-questions hold, and the
 * at-preview handshake still gates actual readiness.
 */
export async function prefetchMedia(
  media: { image?: string; audio?: string },
  mode: GameMode,
  serverUrl: string | null | undefined,
): Promise<boolean> {
  const imageUrl = resolveMediaUrl(media.image, mode, serverUrl);
  const audioUrl = resolveMediaUrl(media.audio, mode, serverUrl);

  const tasks: Promise<unknown>[] = [];
  if (imageUrl) {
    tasks.push(
      Promise.race([
        Image.prefetch(imageUrl).catch(() => false),
        settleAfter(IMAGE_PREFETCH_TIMEOUT_MS),
      ]),
    );
  }
  if (audioUrl) tasks.push(warmAudio(audioUrl));
  await Promise.all(tasks);
  return true;
}
