import type { Player } from '@unfairenough/game-logic';
import { formatOrdinal, useTranslation } from '@unfairenough/i18n';
import {
  Button,
  borderRadius,
  Card,
  PlayerAvatar,
  PositionChart,
  type PositionChartSnapshot,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { PlayerRanking } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CHART_TOP_N } from './scale';

/**
 * Game over for a big room (screen 1f).
 *
 * The rank chart plots only the players who finished on top — eight lines the
 * room can actually follow — and folds everyone else into a shaded band that
 * still shows how deep the pack was. Names sit in a legend ordered by finish,
 * so no label ever collides with a line.
 */

interface ScaledGameOverProps {
  players: Player[];
  rankings: PlayerRanking[];
  positionHistory: PositionChartSnapshot[];
  totalQuestions: number;
  onPlayAgain: () => void;
}

const LEFT_COLUMN_WIDTH = 560;
const LEGEND_WIDTH = 300;

export const ScaledGameOver: React.FC<ScaledGameOverProps> = ({
  players,
  rankings,
  positionHistory,
  totalQuestions,
  onPlayAgain,
}) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const winner = rankings[0];
  const runnersUp = rankings.slice(1, 3);

  const roomAverage =
    rankings.length > 0
      ? Math.round(rankings.reduce((sum, r) => sum + r.score, 0) / rankings.length)
      : 0;

  const chartPlayers = useMemo(
    () =>
      rankings.map((r) => ({
        playerId: r.playerId,
        name: r.name,
        color: playerById.get(r.playerId)?.color ?? theme.accent,
      })),
    [rankings, playerById, theme.accent],
  );

  const legend = chartPlayers.slice(0, CHART_TOP_N);
  const inField = rankings.length - legend.length;

  const chartWidth = Math.max(
    360,
    windowWidth - spacing.xl * 2 - LEFT_COLUMN_WIDTH - spacing.xl - LEGEND_WIDTH - spacing.lg,
  );
  const chartHeight = Math.min(900, Math.max(280, windowHeight - 250));

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('results.gameOver')}</Text>
        <View style={styles.spacer} />
        <Text style={styles.summary}>
          {t('results.playersInRoom', { count: rankings.length })} ·{' '}
          {t('results.questionsCount', { count: totalQuestions })}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.leftColumn}>
          {winner && (
            <Card style={styles.winnerCard} variant="glow" glowColor={theme.title}>
              <Text style={styles.winnerLabel}>{t('results.winner')}</Text>
              <PlayerAvatar
                name={winner.name}
                color={playerById.get(winner.playerId)?.color ?? theme.title}
                emoji={playerById.get(winner.playerId)?.emoji}
                size="large"
                showName={false}
              />
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerScore}>
                {t('results.pointsCount', { score: winner.score })}
              </Text>
            </Card>
          )}

          <View style={styles.runnersUp}>
            {runnersUp.map((entry) => (
              <View key={entry.playerId} style={styles.runnerUp}>
                <Text style={styles.runnerUpRank}>{formatOrdinal(entry.rank, i18n.language)}</Text>
                <PlayerAvatar
                  name={entry.name}
                  color={playerById.get(entry.playerId)?.color ?? theme.accent}
                  emoji={playerById.get(entry.playerId)?.emoji}
                  size="medium"
                  showName={false}
                />
                <Text style={styles.runnerUpName} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={styles.runnerUpScore}>{entry.score}</Text>
              </View>
            ))}
          </View>

          <Card style={styles.averageCard}>
            <Text style={styles.averageText}>
              {t('results.roomAverage', { score: roomAverage })}
            </Text>
            <Text style={styles.averageNote}>{t('results.finalPositionOnPhone')}</Text>
          </Card>

          <Button
            title={t('results.playAgain')}
            onPress={onPlayAgain}
            size="large"
            hasTVPreferredFocus
          />
        </View>

        <View style={styles.rightColumn}>
          {positionHistory.length > 1 ? (
            <>
              <Text style={styles.chartTitle}>
                {inField > 0
                  ? t('results.positionChartTopN', { count: CHART_TOP_N })
                  : t('results.positionChart')}
              </Text>
              <View style={styles.chartRow}>
                <PositionChart
                  players={chartPlayers}
                  positionHistory={positionHistory}
                  width={chartWidth}
                  height={chartHeight}
                  maxSeries={CHART_TOP_N}
                  showEndLabels={false}
                  fieldLabel={
                    inField > 0
                      ? t('results.chartFieldBand', {
                          from: legend.length + 1,
                          to: rankings.length,
                          count: inField,
                        })
                      : undefined
                  }
                />
                <View style={styles.legend}>
                  {legend.map((entry, index) => (
                    <View key={entry.playerId} testID="chart-legend-row" style={styles.legendRow}>
                      <View style={[styles.legendSwatch, { backgroundColor: entry.color }]} />
                      <Text style={styles.legendName} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      <Text style={styles.legendFinish}>#{index + 1}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </View>
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
      alignItems: 'baseline',
      gap: spacing.lg,
    },
    title: {
      ...typography.displayMedium,
      color: t.title,
    },
    spacer: {
      flex: 1,
    },
    summary: {
      ...typography.h3,
      color: t.inkSoft,
    },
    body: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.xl,
    },
    leftColumn: {
      width: LEFT_COLUMN_WIDTH,
      gap: spacing.lg,
    },
    winnerCard: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    winnerLabel: {
      ...typography.label,
      color: t.title,
      letterSpacing: 3,
    },
    winnerName: {
      ...typography.displayMedium,
      color: t.ink,
    },
    winnerScore: {
      ...typography.h2,
      color: t.title,
    },
    runnersUp: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    runnerUp: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.xl,
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    runnerUpRank: {
      ...typography.h3,
      color: t.inkSoft,
    },
    runnerUpName: {
      ...typography.h2,
      color: t.ink,
    },
    runnerUpScore: {
      ...typography.h3,
      color: t.accent,
    },
    averageCard: {
      gap: spacing.xs,
    },
    averageText: {
      ...typography.h3,
      color: t.ink,
    },
    averageNote: {
      ...typography.body,
      color: t.inkSoft,
    },
    rightColumn: {
      flex: 1,
      gap: spacing.md,
    },
    chartTitle: {
      ...typography.label,
      color: t.inkSoft,
      letterSpacing: 2,
    },
    chartRow: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.lg,
    },
    legend: {
      width: LEGEND_WIDTH,
      gap: spacing.sm,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    legendSwatch: {
      width: 34,
      height: 6,
      borderRadius: 3,
    },
    legendName: {
      ...typography.h3,
      color: t.ink,
      flex: 1,
    },
    legendFinish: {
      ...typography.body,
      color: t.inkSoft,
    },
  });
