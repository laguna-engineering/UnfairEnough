import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useGameController } from '../hooks/useGameController';

export const MediaPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, countdown, mediaPreview, serverUrl, mode, notifyMediaLoaded } =
    useGameController();
  const [imageError, setImageError] = useState(false);
  const hasNotifiedRef = useRef(false);

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

  // Build absolute URL for relative media paths
  let imageUrl: string | null = null;
  if (mediaPreview?.type === 'image' && mediaPreview.url) {
    const url = mediaPreview.url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      imageUrl = url;
    } else if (mode === 'hosted' && serverUrl) {
      const host = serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
      imageUrl = `http://${host}/${url}`;
    }
  }

  // If no image URL could be resolved or the image errored, signal failure
  // so the server skips the preview and shows the question immediately
  useEffect(() => {
    if (!imageUrl || imageError) {
      safeNotify(false);
    }
  }, [imageUrl, imageError, safeNotify]);

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
            onLoad={() => safeNotify(true)}
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
