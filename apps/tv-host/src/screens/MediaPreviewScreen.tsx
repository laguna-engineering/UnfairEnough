import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  Card,
  ScreenBackground,
} from '@unfairenough/ui';
import { useTranslation } from '@unfairenough/i18n';
import { useGameController } from '../hooks/useGameController';

export const MediaPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, countdown } = useGameController();
  const [imageError, setImageError] = useState(false);

  // The media info is stored in the gameSlice state when showMediaPreview is dispatched
  // We get questionNumber and totalQuestions from the current game state
  const questionIndex = state.game.questionIndex;
  const totalQuestions = state.game.config.totalQuestions;

  // The current question (if we have it from the questions array) may have media
  // But in TV local mode, we access it via the Redux state
  // The countdown in state.game.countdown is the preview duration countdown

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {t('game.question', { current: questionIndex + 1, total: totalQuestions })}
        </Text>
        <Text style={styles.countdown}>
          {t('mediaPreview.questionIn', { seconds: countdown })}
        </Text>
      </View>

      {/* Media display area */}
      <View style={styles.mediaContainer}>
        {/* In Phase 4, we only support image preview */}
        {/* The URL would need to be accessible from the TV device */}
        <Card style={styles.mediaCard} variant="elevated">
          <Text style={styles.mediaLabel}>{t('mediaPreview.showingMedia')}</Text>
          <View style={styles.countdownCircle}>
            <Text style={styles.countdownNumber}>{countdown}</Text>
          </View>
        </Card>
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
    marginBottom: spacing.xl,
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
  mediaCard: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 400,
    minHeight: 300,
  },
  mediaLabel: {
    ...typography.h2,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  countdownCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: colors.accentYellow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownNumber: {
    ...typography.displayLarge,
    color: colors.accentYellow,
  },
});
