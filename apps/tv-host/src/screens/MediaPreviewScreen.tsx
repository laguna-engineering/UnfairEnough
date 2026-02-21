import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useGameController } from '../hooks/useGameController';

export const MediaPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, countdown, mediaPreview, serverUrl, mode } = useGameController();
  const [imageError, setImageError] = useState(false);

  const questionIndex = state.game.questionIndex;
  const totalQuestions = state.game.config.totalQuestions;

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

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {t('game.question', { current: questionIndex + 1, total: totalQuestions })}
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
            onError={() => setImageError(true)}
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
