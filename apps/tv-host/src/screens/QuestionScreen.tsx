import { playersSelectors } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  Timer,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameController } from '../hooks/useGameController';

const answerColors = {
  A: colors.primary,
  B: colors.secondary,
  C: colors.accentYellow,
  D: colors.accentPurple,
};

export const QuestionScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, currentQuestion, countdown } = useGameController();

  if (!currentQuestion) return null;

  const totalPlayers = playersSelectors.selectTotal(state.players);
  const answeredCount = Object.keys(state.game.answers).length;

  return (
    <ScreenBackground style={styles.container}>
      {/* Header with timer and progress */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {t('game.question', {
            current: currentQuestion.questionNumber,
            total: currentQuestion.totalQuestions,
          })}
        </Text>
        <Timer seconds={countdown} totalSeconds={currentQuestion.timeLimit} size="large" />
        <Text style={styles.answeredCount}>
          {t('game.answeredCount', { answered: answeredCount, total: totalPlayers })}
        </Text>
      </View>

      {/* Question */}
      <Card style={styles.questionCard} variant="elevated">
        <Text style={styles.questionText}>{currentQuestion.text}</Text>
      </Card>

      {/* Answer Options - WWTBAM Style */}
      <View style={styles.optionsGrid}>
        <View style={styles.optionsRow}>
          {currentQuestion.options.slice(0, 2).map((option) => (
            <View
              key={option.key}
              style={[styles.optionCard, { borderLeftColor: answerColors[option.key] }]}
            >
              <Text style={[styles.optionKey, { color: answerColors[option.key] }]}>
                {option.key}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </View>
          ))}
        </View>
        <View style={styles.optionsRow}>
          {currentQuestion.options.slice(2, 4).map((option) => (
            <View
              key={option.key}
              style={[styles.optionCard, { borderLeftColor: answerColors[option.key] }]}
            >
              <Text style={[styles.optionKey, { color: answerColors[option.key] }]}>
                {option.key}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </View>
          ))}
        </View>
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
    marginBottom: spacing.md,
  },
  progress: {
    ...typography.h2,
    color: colors.textSecondary,
  },
  answeredCount: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  questionCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  questionText: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  optionsGrid: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 6,
    padding: spacing.md,
  },
  optionKey: {
    ...typography.h1,
    marginRight: spacing.md,
  },
  optionText: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
});
