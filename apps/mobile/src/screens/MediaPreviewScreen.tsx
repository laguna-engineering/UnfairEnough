import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type { MediaPreviewPayload } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  mediaPreview: MediaPreviewPayload;
}

export const MediaPreviewScreen: React.FC<Props> = ({ mediaPreview }) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(mediaPreview.duration);

  useEffect(() => {
    setCountdown(mediaPreview.duration);
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [mediaPreview]);

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.progress}>
        {t('game.question', {
          current: mediaPreview.questionNumber,
          total: mediaPreview.totalQuestions,
        })}
      </Text>

      <View style={styles.centerContent}>
        <Text style={styles.eyeIcon}>{'👀'}</Text>
        <Text style={styles.lookAtTv}>{t('mediaPreview.lookAtTv')}</Text>
        <Text style={styles.countdown}>{t('mediaPreview.questionIn', { seconds: countdown })}</Text>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  progress: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  lookAtTv: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  countdown: {
    ...typography.h2,
    color: colors.accentYellow,
  },
});
