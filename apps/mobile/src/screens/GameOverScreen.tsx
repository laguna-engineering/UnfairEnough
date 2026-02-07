import { useTranslation } from '@unfairenough/i18n';
import { Button, Card, colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type { GameResult } from '@unfairenough/ws-protocol';
import type React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface GameOverScreenProps {
  result: GameResult;
  playerId: string;
  onPlayAgain: () => void;
  totalGamesBefore?: number;
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  result,
  playerId,
  onPlayAgain,
  totalGamesBefore,
}) => {
  const { t } = useTranslation();
  const myRanking = result.rankings.find((r) => r.playerId === playerId);
  const isWinner = result.winner.playerId === playerId;

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return colors.accentYellow;
      case 2:
        return colors.textSecondary;
      case 3:
        return '#CD7F32';
      default:
        return colors.textSecondary;
    }
  };

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('results.gameOver')}</Text>

      {/* Personal Result */}
      <Card
        style={styles.resultCard}
        variant="glow"
        glowColor={isWinner ? colors.accentYellow : colors.primary}
      >
        {isWinner ? (
          <>
            <Text style={styles.winnerText}>{t('results.youWon')}</Text>
            <Text style={styles.score}>
              {t('results.pointsCount', { score: myRanking?.score })}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.position}>
              {t('results.yourPosition', { position: myRanking?.rank ?? 0 })}
            </Text>
            <Text style={styles.score}>
              {t('results.pointsCount', { score: myRanking?.score })}
            </Text>
          </>
        )}
        {totalGamesBefore != null && (
          <Text style={styles.gameCount}>
            {t('profile.gamesPlayed', { count: totalGamesBefore + 1 })}
          </Text>
        )}
      </Card>

      {/* Leaderboard */}
      <Card style={styles.leaderboardCard}>
        <Text style={styles.leaderboardTitle}>{t('results.finalStandings')}</Text>
        <ScrollView style={styles.leaderboardList}>
          {result.rankings.map((player) => (
            <View
              key={player.playerId}
              style={[styles.leaderboardRow, player.playerId === playerId && styles.highlightedRow]}
            >
              <Text style={[styles.rank, { color: getRankColor(player.rank) }]}>
                #{player.rank}
              </Text>
              <Text
                style={[styles.playerName, player.playerId === playerId && styles.highlightedName]}
                numberOfLines={1}
              >
                {player.name}
                {player.playerId === playerId && ` ${t('results.you')}`}
              </Text>
              <Text style={styles.playerScore}>{player.score}</Text>
            </View>
          ))}
        </ScrollView>
      </Card>

      <Button title={t('results.playAgain')} onPress={onPlayAgain} style={styles.playAgainButton} />
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  resultCard: {
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  winnerText: {
    ...typography.h1,
    color: colors.accentYellow,
    marginBottom: spacing.md,
  },
  position: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  score: {
    ...typography.displayMedium,
    color: colors.primary,
  },
  gameCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  leaderboardCard: {
    flex: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  leaderboardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  leaderboardList: {
    flex: 1,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  highlightedRow: {
    backgroundColor: colors.card,
  },
  rank: {
    ...typography.h3,
    width: 40,
  },
  playerName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  highlightedName: {
    color: colors.primary,
    fontWeight: '600',
  },
  playerScore: {
    ...typography.h3,
    color: colors.accentYellow,
  },
  playAgainButton: {
    marginTop: spacing.md,
  },
});
