import { createAudioPlayer } from 'expo-audio';
import { Image } from 'react-native';
import { resolveMediaUrl } from './mediaUrl';

// Cap how long we wait for an audio file to buffer before treating the warm as
// done — best-effort, since the at-preview MEDIA_LOADED handshake is the backstop.
const AUDIO_WARM_TIMEOUT_MS = 6000;

/** Buffer an audio file in a short-lived player so the real playback starts warm. */
function warmAudio(url: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
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
      setTimeout(() => {
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
  mode: string,
  serverUrl: string | null | undefined,
): Promise<boolean> {
  const imageUrl = resolveMediaUrl(media.image, mode, serverUrl);
  const audioUrl = resolveMediaUrl(media.audio, mode, serverUrl);

  const tasks: Promise<unknown>[] = [];
  if (imageUrl) tasks.push(Image.prefetch(imageUrl).catch(() => false));
  if (audioUrl) tasks.push(warmAudio(audioUrl));
  await Promise.all(tasks);
  return true;
}
