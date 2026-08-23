import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { AnswerKey, PlayerResult, Question } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../../utils/color';
import { TypeBadge } from '../questionTypes/TypeBadge';
import { useDotCloudSize } from './DotCloud';

/**
 * Predict-the-room results for a big room (screen 1a).
 *
 * One dot per vote, grouped under the option it went to. Nobody is named — the
 * votes are anonymous by protocol anyway — so the layout reads identically at
 * 6 players or 200: the room's pick wins by visible mass rather than by a
 * number you have to squint at from the sofa.
 */

interface ScaledPredictRoomResultsProps {
  question: Question & { serverTimestamp: number };
  playerResults: PlayerResult[];
  voteCounts: Partial<Record<AnswerKey, number>>;
  winningOptions: AnswerKey[];
  playerCount: number;
}

const DOT_GAP = spacing.sm;
const DOT_MAX_SIZE = 72;

export const ScaledPredictRoomResults: React.FC<ScaledPredictRoomResultsProps> = ({
  question,
  playerResults,
  voteCounts,
  winningOptions,
  playerCount,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const totalVotes = Object.values(voteCounts).reduce((sum, c) => sum + (c ?? 0), 0);
  const maxVotes = Math.max(0, ...Object.values(voteCounts).map((c) => c ?? 0));
  const { size: dotSize, onLayout: onDotsLayout } = useDotCloudSize({
    maxCount: maxVotes,
    gap: DOT_GAP,
    maxSize: DOT_MAX_SIZE,
  });

  const calledIt = playerResults.filter((r) => r.predictedCorrectly);
  const calledItPoints = calledIt[0]?.pointsEarned ?? 0;

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge kind="predict_room" />
        <Text style={styles.progress}>
          {t('game.question', {
            current: question.questionNumber,
            total: question.totalQuestions,
          })}
        </Text>
        <View style={styles.spacer} />
        <Text style={styles.roomSize}>{t('results.playersInRoom', { count: playerCount })}</Text>
      </View>

      <Text style={styles.questionText} numberOfLines={2}>
        {question.text}
      </Text>

      <View style={styles.columns}>
        {question.options.map((option) => {
          const tile = theme.answerTiles[option.key];
          const count = voteCounts[option.key] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isWinner = winningOptions.includes(option.key);

          return (
            <View
              key={option.key}
              testID="predict-option-column"
              style={[
                styles.column,
                isWinner && {
                  backgroundColor: withAlpha(tile.bg, 0.14),
                  borderColor: tile.bg,
                  borderWidth: 2,
                },
              ]}
            >
              <View style={styles.columnHead}>
                <View style={[styles.letterCircle, { backgroundColor: tile.bg }]}>
                  <Text style={[styles.letterText, { color: tile.ink }]}>{option.key}</Text>
                </View>
                <Text style={styles.optionText} numberOfLines={2}>
                  {option.text}
                </Text>
              </View>

              <View style={styles.dots} onLayout={onDotsLayout}>
                {dotSize > 0 &&
                  Array.from({ length: count }, (_, i) => (
                    <View
                      key={`${option.key}-${i}`}
                      testID="predict-vote-dot"
                      style={{
                        width: dotSize,
                        height: dotSize,
                        borderRadius: dotSize / 2,
                        backgroundColor: tile.bg,
                        opacity: isWinner ? 1 : 0.55,
                      }}
                    />
                  ))}
              </View>

              <View style={styles.columnFoot}>
                <Text style={[styles.pctText, { color: tile.bg }]}>{pct}%</Text>
                <Text style={styles.votesText}>{t('results.votesCount', { count })}</Text>
              </View>

              {isWinner && (
                <View style={[styles.winnerChip, { backgroundColor: tile.bg }]}>
                  <Text style={[styles.winnerChipText, { color: tile.ink }]}>
                    {t('results.roomsPick')}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.calledItPill}>
          <Text style={styles.calledItText}>
            {calledIt.length > 0
              ? t('results.calledItCount', { count: calledIt.length })
              : t('results.nobodyCalledIt')}
          </Text>
          {calledIt.length > 0 && (
            <Text style={styles.calledItPoints}>
              {t('results.eachPlus', { points: calledItPoints })}
            </Text>
          )}
        </View>
        <Text style={styles.footerNote}>{t('results.ownResultOnPhone')}</Text>
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      gap: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    progress: {
      ...typography.h2,
      color: t.inkSoft,
    },
    spacer: {
      flex: 1,
    },
    roomSize: {
      ...typography.h3,
      color: t.inkSoft,
    },
    questionText: {
      ...typography.h1,
      color: t.ink,
      textAlign: 'center',
    },
    columns: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.md,
    },
    column: {
      flex: 1,
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.xl,
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    columnHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    letterCircle: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterText: {
      ...typography.h3,
    },
    optionText: {
      ...typography.bodyLarge,
      color: t.ink,
      flex: 1,
    },
    dots: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      // Centred rather than top-aligned: in a small room the cloud is a few
      // dots in a very tall column, and floating them mid-column reads as a
      // deliberate mass instead of a stub under the heading.
      alignContent: 'center',
      justifyContent: 'center',
      gap: DOT_GAP,
      overflow: 'hidden',
    },
    columnFoot: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    pctText: {
      ...typography.displayMedium,
    },
    votesText: {
      ...typography.body,
      color: t.inkSoft,
    },
    winnerChip: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    winnerChipText: {
      ...typography.label,
      letterSpacing: 2,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
    },
    calledItPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      backgroundColor: t.card,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    calledItText: {
      ...typography.h3,
      color: t.ink,
    },
    calledItPoints: {
      ...typography.h3,
      color: t.success,
    },
    footerNote: {
      ...typography.body,
      color: t.inkSoft,
    },
  });
