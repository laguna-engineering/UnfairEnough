import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  colors,
  typography,
  spacing,
  Card,
  ScreenBackground,
} from '@unfairenough/ui';
import { useTranslation } from '@unfairenough/i18n';
import type { RoundResult, AnswerKey } from '@unfairenough/ws-protocol';

interface ResultScreenProps {
  result: RoundResult;
  playerId: string;
  confirmedAnswer: AnswerKey | null;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  result,
  playerId,
  confirmedAnswer,
}) => {
  const { t } = useTranslation();
  const myResult = result.playerResults.find((r) => r.playerId === playerId);
  const isCorrect = myResult?.isCorrect ?? false;
  const myRank = result.rankings?.find((r) => r.playerId === playerId)?.rank ?? 0;

  return (
    <ScreenBackground style={styles.container}>
      <Card
        style={styles.card}
        variant="glow"
        glowColor={isCorrect ? colors.success : colors.error}
      >
        {/* Result Icon */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isCorrect ? colors.success : colors.error },
          ]}
        >
          <Text style={styles.icon}>{isCorrect ? '✓' : '✗'}</Text>
        </View>

        {/* Result Text */}
        <Text style={[styles.resultText, { color: isCorrect ? colors.success : colors.error }]}>
          {isCorrect ? t('game.correct') : confirmedAnswer ? t('game.incorrect') : t('game.noAnswer')}
        </Text>

        {/* Points Earned */}
        {myResult && isCorrect && (
          <Text style={styles.points}>{t('game.points', { points: myResult.pointsEarned })}</Text>
        )}

        {/* Response Time */}
        {myResult?.responseTimeMs && (
          <Text style={styles.time}>
            {(myResult.responseTimeMs / 1000).toFixed(2)}s
          </Text>
        )}

        {/* Correct Answer */}
        <View style={styles.correctAnswerContainer}>
          <Text style={styles.correctLabel}>{t('game.correctAnswerIs')}</Text>
          <Text style={styles.correctAnswer}>{result.correctAnswer}</Text>
        </View>

        {/* Rank */}
        {result.rankings && myRank > 0 && (
          <Text style={styles.rankText}>{t('results.yourRank', { rank: myRank })}</Text>
        )}

        {/* Total Score */}
        {myResult && (
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>{t('game.yourScore')}</Text>
            <Text style={styles.score}>{myResult.totalScore}</Text>
          </View>
        )}
      </Card>

      <Text style={styles.hint}>{t('game.waitingForNextQuestion')}</Text>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 48,
    color: colors.textPrimary,
  },
  resultText: {
    ...typography.displayMedium,
    marginBottom: spacing.md,
  },
  points: {
    ...typography.h1,
    color: colors.accentYellow,
    marginBottom: spacing.sm,
  },
  time: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  correctAnswerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  correctLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  correctAnswer: {
    ...typography.h2,
    color: colors.success,
  },
  rankText: {
    ...typography.h2,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  scoreContainer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.card,
    width: '100%',
  },
  scoreLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  score: {
    ...typography.displayMedium,
    color: colors.primary,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
