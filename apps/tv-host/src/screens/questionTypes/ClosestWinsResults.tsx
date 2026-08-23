import type { Player } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  colors,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { PlayerRanking, PlayerResult, Question } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { assignLanes } from './laneAssignment';
import { TypeBadge } from './TypeBadge';

const TICK_COUNT = 5;
const LANE_TOP = [64, 128, 192]; // px offsets below the baseline, one per lane
const OUTLIER_STRIP_WIDTH = 130;

interface ClosestWinsResultsProps {
  question: Question & { serverTimestamp: number };
  playerResults: PlayerResult[];
  players: Player[];
  correctValue: number;
  rankings: PlayerRanking[];
}

export const ClosestWinsResults: React.FC<ClosestWinsResultsProps> = ({
  question,
  playerResults,
  players,
  correctValue,
  rankings,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const range = question.range ?? { min: 0, max: 0 };
  const span = range.max - range.min || 1;
  const colorById = useMemo(() => new Map(players.map((p) => [p.id, p.color])), [players]);

  const pctOf = (value: number) => ((value - range.min) / span) * 100;

  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT }, (_, i) => {
        const value = Math.round(range.min + (span * i) / (TICK_COUNT - 1));
        return { value, pct: ((value - range.min) / span) * 100 };
      }),
    [range.min, span],
  );

  const guessers = playerResults.filter((r) => r.guess !== null && r.guess !== undefined);
  const inRange = guessers.filter((r) => r.guess! >= range.min && r.guess! <= range.max);
  const outliers = guessers.filter((r) => r.guess! < range.min || r.guess! > range.max);

  const laned = assignLanes(
    inRange.map((r) => ({ result: r, pos: pctOf(r.guess!) })),
    3,
  );

  const correctPct = Math.min(100, Math.max(0, pctOf(correctValue)));

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge kind="closest_wins" />
        <Text style={styles.progress}>
          {t('game.question', {
            current: question.questionNumber,
            total: question.totalQuestions,
          })}
        </Text>
      </View>

      <Text style={styles.questionText}>{question.text}</Text>

      <View style={styles.trackWrap}>
        <View style={[styles.trackArea, outliers.length > 0 && styles.trackAreaWithOutliers]}>
          <View style={styles.baseline} />

          {ticks.map((tick) => (
            <View key={tick.value} style={[styles.tickWrap, { left: `${tick.pct}%` }]}>
              <View style={styles.tickMark} />
              <Text style={styles.tickLabel}>{tick.value.toLocaleString()}</Text>
            </View>
          ))}

          <View style={[styles.answerWrap, { left: `${correctPct}%` }]}>
            <View style={styles.answerCard}>
              <Text style={styles.answerLabel}>{t('results.theAnswer')}</Text>
              <Text style={styles.answerValue}>{correctValue.toLocaleString()}</Text>
            </View>
            <View style={styles.answerStem} />
            <View style={styles.answerDot} />
          </View>

          {laned.map(({ result, pos, lane }) => {
            const color = colorById.get(result.playerId) ?? colors.accent;
            const top = LANE_TOP[lane] ?? LANE_TOP[LANE_TOP.length - 1];
            return (
              <View key={result.playerId} style={[styles.markerWrap, { left: `${pos}%` }]}>
                <View style={[styles.markerDot, { backgroundColor: color, borderColor: color }]} />
                <View style={[styles.markerStem, { height: top - 4, backgroundColor: color }]} />
                <View testID="guess-chip" style={[styles.markerChip, { top, borderColor: color }]}>
                  <Text style={[styles.markerName, { color }]}>{result.name}</Text>
                  <Text style={styles.markerValue}>{result.guess?.toLocaleString()}</Text>
                  {result.isClosest ? (
                    <Text style={styles.markerPtsClosest}>
                      +{result.pointsEarned} · {t('results.closestChip')}
                    </Text>
                  ) : (
                    <Text style={styles.markerPts}>+{result.pointsEarned}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {outliers.length > 0 && (
          <View style={styles.outlierStrip}>
            <Text style={styles.outlierGlyph}>≋</Text>
            {outliers.map((result) => {
              const color = colorById.get(result.playerId) ?? colors.accent;
              return (
                <View key={result.playerId} style={styles.outlierChip}>
                  <View
                    style={[styles.outlierDot, { backgroundColor: color, borderColor: color }]}
                  />
                  <Text style={[styles.markerName, { color }]}>{result.name}</Text>
                  <Text style={styles.markerValue}>{result.guess?.toLocaleString()}</Text>
                  {result.isClosest ? (
                    <Text style={styles.markerPtsClosest}>
                      +{result.pointsEarned} · {t('results.closestChip')}
                    </Text>
                  ) : (
                    <Text style={styles.markerPts}>+{result.pointsEarned}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.footer}>{t('game.closerMorePoints')}</Text>

      <View style={styles.leaderboardStrip}>
        {rankings.slice(0, 8).map((r) => (
          <View key={r.playerId} style={styles.leaderboardChip}>
            <View
              style={[
                styles.leaderboardDot,
                { backgroundColor: colorById.get(r.playerId) ?? colors.accent },
              ]}
            />
            <Text style={styles.leaderboardName}>{r.name}</Text>
            <Text style={styles.leaderboardScore}>{r.score}</Text>
          </View>
        ))}
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
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
    questionText: {
      ...typography.h1,
      fontSize: 26,
      lineHeight: 32,
      color: t.ink,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    trackWrap: {
      flex: 1,
      flexDirection: 'row',
      marginTop: spacing.lg,
    },
    trackArea: {
      flex: 1,
      position: 'relative',
    },
    trackAreaWithOutliers: {
      marginRight: spacing.md,
    },
    baseline: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    tickWrap: {
      position: 'absolute',
      top: 10,
      alignItems: 'center',
      transform: [{ translateX: -20 }],
      width: 40,
    },
    tickMark: {
      width: 2,
      height: 12,
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    tickLabel: {
      ...typography.bodySmall,
      color: t.inkSoft,
      marginTop: spacing.xs,
    },
    answerWrap: {
      position: 'absolute',
      top: -76,
      alignItems: 'center',
      transform: [{ translateX: -60 }],
      width: 120,
    },
    answerCard: {
      backgroundColor: colors.accentYellow,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    answerLabel: {
      ...typography.label,
      color: '#1a1a2e',
      letterSpacing: 2,
    },
    answerValue: {
      ...typography.h2,
      color: '#1a1a2e',
    },
    answerStem: {
      width: 4,
      height: 40,
      backgroundColor: colors.accentYellow,
    },
    answerDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.accentYellow,
      borderWidth: 3,
      borderColor: t.card,
      marginTop: -2,
    },
    markerWrap: {
      position: 'absolute',
      top: -2,
      alignItems: 'center',
      width: 0,
    },
    markerDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 3,
      transform: [{ translateX: -8 }],
    },
    markerStem: {
      width: 3,
      opacity: 0.5,
      transform: [{ translateX: -1.5 }],
    },
    markerChip: {
      position: 'absolute',
      backgroundColor: 'rgba(13,20,40,0.92)',
      borderWidth: 2,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      alignItems: 'center',
      transform: [{ translateX: -50 }],
      width: 100,
    },
    markerName: {
      ...typography.label,
    },
    markerValue: {
      ...typography.bodySmall,
      color: '#ffffff',
    },
    markerPts: {
      ...typography.bodySmall,
      color: '#E0E0E0',
    },
    markerPtsClosest: {
      ...typography.label,
      color: '#1a1a2e',
      backgroundColor: colors.accentYellow,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      marginTop: 2,
      overflow: 'hidden',
    },
    outlierStrip: {
      width: OUTLIER_STRIP_WIDTH,
      borderLeftWidth: 2,
      borderLeftColor: 'rgba(255,255,255,0.18)',
      borderStyle: 'dashed',
      paddingLeft: spacing.sm,
      gap: spacing.sm,
    },
    outlierGlyph: {
      ...typography.h3,
      color: t.inkSoft,
      textAlign: 'center',
    },
    outlierChip: {
      backgroundColor: 'rgba(13,20,40,0.92)',
      borderWidth: 2,
      borderColor: colors.accentYellow,
      borderRadius: borderRadius.lg,
      padding: spacing.xs,
      alignItems: 'center',
    },
    outlierDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      marginBottom: spacing.xs,
    },
    footer: {
      ...typography.h3,
      color: t.inkSoft,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    leaderboardStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    leaderboardChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.cardBorder,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
    },
    leaderboardDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    leaderboardName: {
      ...typography.bodySmall,
      color: t.ink,
    },
    leaderboardScore: {
      ...typography.bodySmall,
      color: t.accent,
      fontWeight: '700',
    },
  });
