import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useBgMusicContext } from '../hooks/BgMusicContext';
import { useGameController } from '../hooks/useGameController';
import { resolveMediaUrl } from '../utils/mediaUrl';

// If the clip hasn't reported "ready" within this window we treat it as a load
// failure and skip the preview — expo-audio surfaces no load-error event, so a
// timeout stands in for the image path's onError. Kept under the server's 10s
// MEDIA_LOAD backstop so the TV drives the skip.
const AUDIO_LOAD_TIMEOUT_MS = 8000;

export const MediaPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, countdown, mediaPreview, serverUrl, mode, notifyMediaLoaded } =
    useGameController();
  const { pause, resume } = useBgMusicContext();
  const [imageError, setImageError] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const hasNotifiedRef = useRef(false);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // Correlation ID: echo the question ID back so the server can ignore stale
  // messages that arrive after the question has already advanced.
  const questionId = mediaPreview?.questionId;

  // At-most-once wrapper: prevents stale callbacks (e.g. onLoad firing after
  // unmount in hosted mode) from sending duplicate MEDIA_LOADED messages that
  // could bleed into the next question's preview window.
  const safeNotify = useCallback(
    (success: boolean) => {
      if (hasNotifiedRef.current) return;
      hasNotifiedRef.current = true;
      notifyMediaLoaded(success, questionId);
    },
    [notifyMediaLoaded, questionId],
  );

  const questionNumber = mediaPreview?.questionNumber ?? state.game.questionIndex + 1;
  const totalQuestions = mediaPreview?.totalQuestions ?? state.game.config.totalQuestions;

  const imageUrl =
    mediaPreview?.type === 'image' ? resolveMediaUrl(mediaPreview.url, mode, serverUrl) : null;
  const audioUrl = resolveMediaUrl(mediaPreview?.audio?.url, mode, serverUrl);
  const hasImage = !!imageUrl;
  const hasAudio = !!audioUrl;

  // Duck the ambient app track while the preview clip plays; restore on exit.
  useEffect(() => {
    if (!hasAudio) return;
    pause();
    return () => resume();
  }, [hasAudio, pause, resume]);

  // Prepare and play the listen-first audio clip; readiness (or a load timeout)
  // drives the MEDIA_LOADED handshake (KTD7).
  useEffect(() => {
    if (!audioUrl) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let player: AudioPlayer | null = null;
    try {
      player = createAudioPlayer({ uri: audioUrl });
      player.volume = 1;
      audioPlayerRef.current = player;
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded) {
          setAudioReady(true);
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
        }
      });
      player.play();
      timeout = setTimeout(() => setAudioError(true), AUDIO_LOAD_TIMEOUT_MS);
      return () => {
        if (timeout) clearTimeout(timeout);
        sub.remove();
        player?.remove();
        audioPlayerRef.current = null;
      };
    } catch {
      setAudioError(true);
      return () => {
        if (timeout) clearTimeout(timeout);
        player?.remove();
        audioPlayerRef.current = null;
      };
    }
  }, [audioUrl]);

  // Drive the MEDIA_LOADED handshake off the readiness of every present clip.
  // Nothing to preview, or any load error → skip (matching the image path).
  useEffect(() => {
    if (!hasImage && !hasAudio) {
      safeNotify(false);
      return;
    }
    if (imageError || audioError) {
      safeNotify(false);
      return;
    }
    const imageOk = !hasImage || imageReady;
    const audioOk = !hasAudio || audioReady;
    if (imageOk && audioOk) safeNotify(true);
  }, [hasImage, hasAudio, imageError, audioError, imageReady, audioReady, safeNotify]);

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {t('game.question', { current: questionNumber, total: totalQuestions })}
        </Text>
        <Text style={styles.countdown}>{t('mediaPreview.questionIn', { seconds: countdown })}</Text>
      </View>

      {/* Media display area */}
      <View style={styles.mediaContainer}>
        {imageUrl && !imageError ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
            onLoad={() => setImageReady(true)}
            onError={() => {
              setImageError(true);
            }}
          />
        ) : (
          <View style={styles.fallback}>
            <Text style={styles.fallbackText}>{t('mediaPreview.showingMedia')}</Text>
          </View>
        )}
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  progress: {
    ...typography.h2,
    color: colors.textSecondary,
  },
  countdown: {
    ...typography.h2,
    color: colors.accentYellow,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '80%',
    height: '100%',
    borderRadius: 16,
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    ...typography.h2,
    color: colors.textSecondary,
  },
});
