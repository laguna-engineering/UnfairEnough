import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, spacing } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { typography } from '../theme/typography';
import { RankChangeIndicator } from './RankChangeIndicator';

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  rank: number;
  score: number;
  pointsEarned?: number;
  difficultyMultiplier?: number;
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

const getRankColor = (rank: number, t: ThemeTokens) => {
  switch (rank) {
    case 1:
      return t.title;
    case 2:
      return t.inkSoft;
    case 3:
      return '#CD7F32';
    default:
      return t.inkSoft;
  }
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  highlightPlayerId,
  showRankChange = false,
  showPoints = false,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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
            <Text style={[styles.rank, { color: getRankColor(entry.rank, theme) }]}>
              #{entry.rank}
            </Text>

            {/* Color dot */}
            {entry.color && <View style={[styles.colorDot, { backgroundColor: entry.color }]} />}

            {/* Name */}
            <Text style={[styles.name, isHighlighted && styles.highlightedName]} numberOfLines={1}>
              {entry.name}
            </Text>

            {/* Points earned this round */}
            {showPoints && entry.pointsEarned !== undefined && entry.pointsEarned > 0 && (
              <Text style={styles.pointsEarned}>
                +{entry.pointsEarned}
                {entry.difficultyMultiplier !== undefined && entry.difficultyMultiplier > 1.0
                  ? entry.difficultyMultiplier > 1.05
                    ? ' ⭐⭐'
                    : ' ⭐'
                  : ''}
              </Text>
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

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    highlightedRow: {
      backgroundColor: t.accentSoft,
      borderColor: 'transparent',
    },
    correctRow: {
      borderLeftWidth: 3,
      borderLeftColor: t.success,
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
      color: t.ink,
      flex: 1,
    },
    highlightedName: {
      color: t.accentInk,
      fontWeight: '600',
    },
    pointsEarned: {
      ...typography.label,
      color: t.success,
      marginRight: spacing.md,
    },
    score: {
      ...typography.h3,
      color: t.accent,
      minWidth: 60,
      textAlign: 'right',
    },
  });
