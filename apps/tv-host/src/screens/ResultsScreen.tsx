import { playersSelectors } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  Card,
  colors,
  Leaderboard,
  type LeaderboardEntry,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameController } from '../hooks/useGameController';

const answerColors = {
  A: colors.primary,
  B: colors.secondary,
  C: colors.accentYellow,
  D: colors.accentPurple,
};

export const ResultsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, currentQuestion, roundResults, roundTags, rankings, positionHistory } =
    useGameController();

  const players = playersSelectors.selectAll(state.players);

  // Compute rank changes from positionHistory
  const previousRankings =
    positionHistory.length >= 2 ? positionHistory[positionHistory.length - 2] : null;

  const leaderboardEntries: LeaderboardEntry[] = useMemo(() => {
    return rankings.map((r) => {
      const player = players.find((p) => p.id === r.playerId);
      const result = roundResults.find((res) => res.playerId === r.playerId);
      const prevPos = previousRankings?.positions.find((p) => p.playerId === r.playerId);
      // Rank change: positive = moved up (lower rank number = better)
      const rankChange = prevPos ? prevPos.rank - r.rank : 0;

      return {
        playerId: r.playerId,
        name: r.name,
        rank: r.rank,
        score: r.score,
        pointsEarned: result?.pointsEarned ?? 0,
        difficultyMultiplier: result?.difficultyMultiplier,
        color: player?.color,
        isCorrect: result?.isCorrect ?? false,
        rankChange,
      };
    });
  }, [rankings, players, roundResults, previousRankings]);

  if (!currentQuestion) return null;

  // Get correct answer from the first result that was correct
  const correctAnswer =
    roundResults.find((r) => r.isCorrect)?.answer || currentQuestion.options[2]?.key;

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.content}>
        {/* Correct Answer Display */}
        <Card style={styles.correctAnswerCard} variant="glow" glowColor={colors.success}>
          <Text style={styles.correctLabel}>{t('game.correctAnswerLabel')}</Text>
          <View style={styles.correctAnswerRow}>
            <Text
              style={[
                styles.answerKey,
                { color: answerColors[correctAnswer as keyof typeof answerColors] },
              ]}
            >
              {correctAnswer}
            </Text>
            <Text style={styles.answerText}>
              {currentQuestion.options.find((o) => o.key === correctAnswer)?.text}
            </Text>
          </View>
          {roundTags.length > 0 && (
            <View style={styles.tagsRow}>
              {roundTags.map((tag) => (
                <View key={tag} style={styles.tagBadge}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Leaderboard */}
        <View style={styles.leaderboardSection}>
          <Text style={styles.leaderboardTitle}>{t('results.leaderboard')}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Leaderboard
              entries={leaderboardEntries}
              showRankChange={positionHistory.length > 1}
              showPoints
            />
          </ScrollView>
        </View>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
  },
  correctAnswerCard: {
    padding: spacing.xl,
    alignItems: 'center',
    alignSelf: 'flex-start',
    minWidth: 280,
  },
  correctLabel: {
    ...typography.h3,
    color: colors.success,
    marginBottom: spacing.md,
  },
  correctAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  answerKey: {
    ...typography.displayLarge,
    marginRight: spacing.lg,
  },
  answerText: {
    ...typography.displayMedium,
    color: colors.textPrimary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  tagBadge: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  tagText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  leaderboardSection: {
    flex: 1,
  },
  leaderboardTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
});
