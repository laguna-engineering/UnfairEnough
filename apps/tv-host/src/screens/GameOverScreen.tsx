import { playersSelectors, rankPlayers } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  Button,
  Card,
  PlayerAvatar,
  PositionChart,
  type PositionChartPlayer,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useGameController } from '../hooks/useGameController';
import { ScaledGameOver } from './scaled/ScaledGameOver';
import { isScaledRoom } from './scaled/scale';

export const GameOverScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, resetGame, positionHistory } = useGameController();
  const { width: windowWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const players = playersSelectors.selectAll(state.players);
  const emojiById = new Map(players.map((p) => [p.id, p.emoji]));
  const rankings = rankPlayers(players.map((p) => ({ id: p.id, name: p.name, score: p.score })));

  const winner = rankings[0];
  const podium = rankings.slice(0, 3);

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return theme.accent;
      case 2:
        return theme.inkSoft;
      case 3:
        return '#CD7F32'; // Bronze
      default:
        return theme.inkSoft;
    }
  };

  const getOrdinal = (rank: number) => {
    switch (rank) {
      case 1:
        return t('results.ordinal1');
      case 2:
        return t('results.ordinal2');
      case 3:
        return t('results.ordinal3');
      default:
        return `#${rank}`;
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

  // Past a handful of players the podium-plus-every-line layout stops being
  // readable from the sofa — see scaled/scale.ts.
  if (isScaledRoom(players.length)) {
    return (
      <ScaledGameOver
        players={players}
        rankings={rankings.map((r) => ({
          playerId: r.id,
          name: r.name,
          score: r.score,
          rank: r.rank,
        }))}
        positionHistory={chartHistory}
        totalQuestions={state.game.config.totalQuestions}
        onPlayAgain={resetGame}
      />
    );
  }

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('results.gameOver')}</Text>

      <View style={styles.mainContent}>
        <View style={styles.leftColumn}>
          {/* Winner Celebration */}
          {winner && (
            <Card style={styles.winnerCard} variant="glow" glowColor={theme.accent}>
              <Text style={styles.winnerLabel}>{t('results.winner')}</Text>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerScore}>
                {t('results.pointsCount', { score: winner.score })}
              </Text>
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
                  emoji={emojiById.get(podium[1].id)}
                  size="medium"
                  showScore
                  score={podium[1].score}
                />
                <Text style={[styles.rankText, { color: theme.title }]}>{getOrdinal(2)}</Text>
              </View>
            )}

            {/* 1st Place */}
            {podium[0] && (
              <View style={[styles.podiumSpot, styles.firstPlace]}>
                <PlayerAvatar
                  name={podium[0].name}
                  color={getRankColor(1)}
                  emoji={emojiById.get(podium[0].id)}
                  size="medium"
                  showScore
                  score={podium[0].score}
                />
                <Text style={[styles.rankText, { color: theme.title }]}>{getOrdinal(1)}</Text>
              </View>
            )}

            {/* 3rd Place */}
            {podium[2] && (
              <View style={[styles.podiumSpot, styles.thirdPlace]}>
                <PlayerAvatar
                  name={podium[2].name}
                  color={getRankColor(3)}
                  emoji={emojiById.get(podium[2].id)}
                  size="medium"
                  showScore
                  score={podium[2].score}
                />
                <Text style={[styles.rankText, { color: theme.title }]}>{getOrdinal(3)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.rightColumn}>
          {/* Position Chart */}
          {chartHistory.length > 1 && (
            <>
              <Text style={styles.chartTitle}>{t('results.positionChart')}</Text>
              <PositionChart
                players={chartPlayers}
                positionHistory={chartHistory}
                width={chartWidth * 0.4}
                height={230}
              />
            </>
          )}

          {/* Play Again Button */}
          <Button
            title={t('results.playAgain')}
            onPress={resetGame}
            size="large"
            style={styles.playAgainButton}
            hasTVPreferredFocus
          />
        </View>
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    title: {
      ...typography.displayLarge,
      color: t.title,
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
      color: t.ink,
      marginBottom: spacing.md,
    },
    winnerCard: {
      paddingHorizontal: spacing.xxl,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    winnerLabel: {
      ...typography.h2,
      color: t.accent,
      marginBottom: spacing.sm,
    },
    winnerName: {
      ...typography.displayMedium,
      color: t.ink,
      marginBottom: spacing.sm,
    },
    winnerScore: {
      ...typography.h2,
      color: t.accent,
    },
    podium: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    podiumSpot: {
      alignItems: 'center',
    },
    firstPlace: {
      marginBottom: spacing.lg,
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
    playAgainButton: {
      minWidth: 200,
      marginTop: spacing.lg,
    },
  });
