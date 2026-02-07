import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { RankChangeIndicator } from './RankChangeIndicator';

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  rank: number;
  score: number;
  pointsEarned?: number;
  color?: string;
  isCorrect?: boolean;
  rankChange?: number; // positive = moved up, negative = moved down
}

export interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightPlayerId?: string;
  showRankChange?: boolean;
  showPoints?: boolean;
}

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

export const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  highlightPlayerId,
  showRankChange = false,
  showPoints = false,
}) => {
  return (
    <View style={styles.container}>
      {entries.map((entry) => {
        const isHighlighted = entry.playerId === highlightPlayerId;
        return (
          <View
            key={entry.playerId}
            style={[
              styles.row,
              isHighlighted && styles.highlightedRow,
              entry.isCorrect && styles.correctRow,
            ]}
          >
            {/* Rank */}
            <Text style={[styles.rank, { color: getRankColor(entry.rank) }]}>#{entry.rank}</Text>

            {/* Color dot */}
            {entry.color && <View style={[styles.colorDot, { backgroundColor: entry.color }]} />}

            {/* Name */}
            <Text style={[styles.name, isHighlighted && styles.highlightedName]} numberOfLines={1}>
              {entry.name}
            </Text>

            {/* Points earned this round */}
            {showPoints && entry.pointsEarned !== undefined && entry.pointsEarned > 0 && (
              <Text style={styles.pointsEarned}>+{entry.pointsEarned}</Text>
            )}

            {/* Total score */}
            <Text style={styles.score}>{entry.score}</Text>

            {/* Rank change indicator */}
            {showRankChange && entry.rankChange !== undefined && (
              <RankChangeIndicator change={entry.rankChange} />
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  highlightedRow: {
    backgroundColor: colors.card,
  },
  correctRow: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  rank: {
    ...typography.h3,
    width: 48,
    textAlign: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  highlightedName: {
    color: colors.primary,
    fontWeight: '600',
  },
  pointsEarned: {
    ...typography.label,
    color: colors.success,
    marginRight: spacing.md,
  },
  score: {
    ...typography.h3,
    color: colors.accentYellow,
    minWidth: 60,
    textAlign: 'right',
  },
});
