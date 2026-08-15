import { playersSelectors } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  Card,
  Leaderboard,
  type LeaderboardEntry,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { AnswerKey } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameController } from '../hooks/useGameController';
import { ClosestWinsResults } from './questionTypes/ClosestWinsResults';
import { PredictRoomResults } from './questionTypes/PredictRoomResults';
import { TwoChoiceResults } from './questionTypes/TwoChoiceResults';

// Past this many players a single column risks running off the bottom of the
// (auto-advancing, non-scrollable) results screen, so we split into two columns.
const TWO_COLUMN_THRESHOLD = 8;

export const ResultsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const {
    state,
    currentQuestion,
    roundResults,
    roundTags,
    rankings,
    positionHistory,
    roundQuestionType,
    roundCorrectValue,
    roundVoteCounts,
    roundWinningOptions,
  } = useGameController();

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

  const showRankChange = positionHistory.length > 1;
  const questionType = roundQuestionType ?? currentQuestion.type ?? 'multiple_choice';

  if (questionType === 'closest_wins') {
    return (
      <ClosestWinsResults
        question={currentQuestion}
        playerResults={roundResults}
        players={players}
        correctValue={roundCorrectValue ?? 0}
        rankings={rankings}
      />
    );
  }

  if (questionType === 'predict_room') {
    return (
      <PredictRoomResults
        question={currentQuestion}
        playerResults={roundResults}
        players={players}
        voteCounts={roundVoteCounts ?? {}}
        winningOptions={roundWinningOptions ?? []}
      />
    );
  }

  if (questionType === 'true_false' || currentQuestion.options.length === 2) {
    const correctAnswer = (state.game.correctAnswer ?? currentQuestion.options[0]?.key) as
      | AnswerKey
      | undefined;
    if (!correctAnswer) return null;
    return (
      <TwoChoiceResults
        question={currentQuestion}
        correctAnswer={correctAnswer}
        playerResults={roundResults}
        leaderboardEntries={leaderboardEntries}
        showRankChange={showRankChange}
      />
    );
  }

  const correctAnswer = state.game.correctAnswer ?? currentQuestion.options[0]?.key;

  const twoColumns = leaderboardEntries.length > TWO_COLUMN_THRESHOLD;
  const splitIndex = Math.ceil(leaderboardEntries.length / 2);
  const firstColumn = twoColumns ? leaderboardEntries.slice(0, splitIndex) : leaderboardEntries;
  const secondColumn = twoColumns ? leaderboardEntries.slice(splitIndex) : [];

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.content}>
        {/* Correct Answer Display */}
        <Card style={styles.correctAnswerCard} variant="glow" glowColor={theme.success}>
          <Text style={styles.correctLabel}>{t('game.correctAnswerLabel')}</Text>
          <View style={styles.correctAnswerRow}>
            <View style={styles.answerBadge}>
              <Text style={styles.answerKey}>{correctAnswer}</Text>
            </View>
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

        {/* Leaderboard — split into two columns when many players so the whole
            board always fits on the auto-advancing (non-scrollable) screen. */}
        <View style={styles.leaderboardSection}>
          <Text style={styles.leaderboardTitle}>{t('results.leaderboard')}</Text>
          {twoColumns ? (
            <View style={styles.leaderboardColumns}>
              <View style={styles.leaderboardColumn}>
                <Leaderboard entries={firstColumn} showRankChange={showRankChange} showPoints />
              </View>
              <View style={styles.leaderboardColumn}>
                <Leaderboard entries={secondColumn} showRankChange={showRankChange} showPoints />
              </View>
            </View>
          ) : (
            <Leaderboard entries={leaderboardEntries} showRankChange={showRankChange} showPoints />
          )}
        </View>
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.xl,
    },
    content: {
      flex: 1,
      gap: spacing.lg,
    },
    correctAnswerCard: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      alignItems: 'center',
    },
    correctLabel: {
      ...typography.h3,
      color: t.success,
      marginBottom: spacing.md,
    },
    correctAnswerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    answerBadge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: t.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.lg,
    },
    answerKey: {
      ...typography.displayMedium,
      color: t.accentInk,
    },
    answerText: {
      ...typography.h1,
      color: t.ink,
      flexShrink: 1,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.md,
      justifyContent: 'center',
    },
    tagBadge: {
      backgroundColor: t.chipBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: 12,
    },
    tagText: {
      ...typography.bodySmall,
      color: t.chipInk,
    },
    leaderboardSection: {
      flex: 1,
    },
    leaderboardColumns: {
      flexDirection: 'row',
      gap: spacing.xl,
    },
    leaderboardColumn: {
      flex: 1,
    },
    leaderboardTitle: {
      ...typography.h2,
      color: t.ink,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
  });
