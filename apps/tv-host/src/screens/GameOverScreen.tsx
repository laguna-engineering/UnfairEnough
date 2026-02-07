import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import {
  colors,
  typography,
  spacing,
  Card,
  Button,
  PlayerAvatar,
  ScreenBackground,
  PositionChart,
  type PositionChartPlayer,
} from '@unfairenough/ui';
import { playersSelectors, rankPlayers } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import { useGameController } from '../hooks/useGameController';

export const GameOverScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, resetGame, positionHistory } = useGameController();
  const { width: windowWidth } = useWindowDimensions();

  const players = playersSelectors.selectAll(state.players);
  const rankings = rankPlayers(
    players.map((p) => ({ id: p.id, name: p.name, score: p.score }))
  );

  const winner = rankings[0];
  const podium = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return colors.accentYellow;
      case 2:
        return colors.textSecondary;
      case 3:
        return '#CD7F32'; // Bronze
      default:
        return colors.textSecondary;
    }
  };

  const getOrdinal = (rank: number) => {
    switch (rank) {
      case 1: return t('results.ordinal1');
      case 2: return t('results.ordinal2');
      case 3: return t('results.ordinal3');
      default: return `#${rank}`;
    }
  };

  // Build chart data
  const chartPlayers: PositionChartPlayer[] = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    color: p.color,
  }));

  const chartHistory = positionHistory.map((snap) => ({
    round: snap.round,
    positions: snap.positions.map((pos) => ({
      playerId: pos.playerId,
      rank: pos.rank,
    })),
  }));

  const chartWidth = Math.min(windowWidth - 192, 800); // TV safe zone margins

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('results.gameOver')}</Text>

      <View style={styles.mainContent}>
        <View style={styles.leftColumn}>
          {/* Winner Celebration */}
          {winner && (
            <Card style={styles.winnerCard} variant="glow" glowColor={colors.accentYellow}>
              <Text style={styles.winnerLabel}>{t('results.winner')}</Text>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerScore}>{t('results.pointsCount', { score: winner.score })}</Text>
            </Card>
          )}

          {/* Podium */}
          <View style={styles.podium}>
            {/* 2nd Place */}
            {podium[1] && (
              <View style={[styles.podiumSpot, styles.secondPlace]}>
                <PlayerAvatar
                  name={podium[1].name}
                  color={getRankColor(2)}
                  size="large"
                  showScore
                  score={podium[1].score}
                />
                <Text style={[styles.rankText, { color: getRankColor(2) }]}>{getOrdinal(2)}</Text>
              </View>
            )}

            {/* 1st Place */}
            {podium[0] && (
              <View style={[styles.podiumSpot, styles.firstPlace]}>
                <PlayerAvatar
                  name={podium[0].name}
                  color={getRankColor(1)}
                  size="large"
                  showScore
                  score={podium[0].score}
                />
                <Text style={[styles.rankText, { color: getRankColor(1) }]}>{getOrdinal(1)}</Text>
              </View>
            )}

            {/* 3rd Place */}
            {podium[2] && (
              <View style={[styles.podiumSpot, styles.thirdPlace]}>
                <PlayerAvatar
                  name={podium[2].name}
                  color={getRankColor(3)}
                  size="large"
                  showScore
                  score={podium[2].score}
                />
                <Text style={[styles.rankText, { color: getRankColor(3) }]}>{getOrdinal(3)}</Text>
              </View>
            )}
          </View>

          {/* Remaining Players - 3-column grid */}
          {rest.length > 0 && (
            <View style={styles.restGrid}>
              {rest.map((player) => (
                <Card key={player.id} style={styles.restCard}>
                  <Text style={styles.restRank}>#{player.rank}</Text>
                  <Text style={styles.restName} numberOfLines={1}>{player.name}</Text>
                  <Text style={styles.restScore}>{player.score}</Text>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* Position Chart */}
        {chartHistory.length > 1 && (
          <View style={styles.rightColumn}>
            <Text style={styles.chartTitle}>{t('results.positionChart')}</Text>
            <PositionChart
              players={chartPlayers}
              positionHistory={chartHistory}
              width={chartWidth * 0.45}
              height={280}
            />
          </View>
        )}
      </View>

      {/* Play Again Button */}
      <View style={styles.buttonContainer}>
        <Button
          title={t('results.playAgain')}
          onPress={resetGame}
          size="large"
          style={styles.playAgainButton}
        />
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: {
    ...typography.displayLarge,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
    width: '100%',
  },
  leftColumn: {
    flex: 1,
    alignItems: 'center',
  },
  rightColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  winnerCard: {
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  winnerLabel: {
    ...typography.h3,
    color: colors.accentYellow,
    marginBottom: spacing.xs,
  },
  winnerName: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  winnerScore: {
    ...typography.h2,
    color: colors.accentYellow,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  podiumSpot: {
    alignItems: 'center',
  },
  firstPlace: {
    marginBottom: spacing.xl,
  },
  secondPlace: {
    marginBottom: spacing.md,
  },
  thirdPlace: {
    marginBottom: 0,
  },
  rankText: {
    ...typography.h2,
    marginTop: spacing.sm,
  },
  restGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  restCard: {
    padding: spacing.sm,
    alignItems: 'center',
    minWidth: 100,
    width: '30%',
  },
  restRank: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  restName: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginVertical: spacing.xs,
    textAlign: 'center',
  },
  restScore: {
    ...typography.label,
    color: colors.accentYellow,
  },
  buttonContainer: {
    marginTop: spacing.lg,
  },
  playAgainButton: {
    minWidth: 200,
  },
});
