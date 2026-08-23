import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  type LeaderboardEntry,
  RankChangeIndicator,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDotCloudSize } from './DotCloud';
import { LEADERBOARD_TOP_N } from './scale';

/**
 * Leaderboard for a big room (screen 1e).
 *
 * Names the top twelve at a size that survives the back of the room, then
 * shows the rest of the field as a crowd of dots — one per player, in their
 * own colour. A row per player past that point is unreadable anyway, and the
 * crowd answers the only question the shared screen can honestly answer at
 * that size: how many people are still out there, and how far back. Each
 * player's own position is on their phone. Below thirteen players the whole
 * room fits in the named part, so the "top 12" framing and the field panel
 * both disappear.
 */

interface ScaledLeaderboardProps {
  entries: LeaderboardEntry[];
  showRankChange: boolean;
}

const DOT_GAP = spacing.sm;
const DOT_MAX_SIZE = 44;

export const ScaledLeaderboard: React.FC<ScaledLeaderboardProps> = ({
  entries,
  showRankChange,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const top = entries.slice(0, LEADERBOARD_TOP_N);
  const rest = entries.slice(LEADERBOARD_TOP_N);
  const { size: dotSize, onLayout: onDotsLayout } = useDotCloudSize({
    maxCount: rest.length,
    gap: DOT_GAP,
    maxSize: DOT_MAX_SIZE,
  });

  // Entries arrive ranked, so the field's score span is its two ends.
  const fieldHigh = rest[0]?.score ?? 0;
  const fieldLow = rest[rest.length - 1]?.score ?? 0;

  // Two columns of six: twelve rows stacked in one column would each be half
  // the height, which is exactly the readability we are trying to buy back.
  const splitIndex = Math.ceil(top.length / 2);
  const columns = [
    { id: 'leading', entries: top.slice(0, splitIndex) },
    { id: 'trailing', entries: top.slice(splitIndex) },
  ];

  const biggestClimb = useMemo(() => {
    if (!showRankChange) return null;
    const best = entries.reduce<LeaderboardEntry | null>(
      (climber, entry) => ((entry.rankChange ?? 0) > (climber?.rankChange ?? 0) ? entry : climber),
      null,
    );
    return best && (best.rankChange ?? 0) > 0 ? best : null;
  }, [entries, showRankChange]);

  return (
    <View style={styles.container}>
      <View style={styles.boardSide}>
        <Text style={styles.sectionTitle}>
          {/* Below the cut-off the "top 12" is simply everyone, so say so. */}
          {rest.length > 0
            ? t('results.topN', { count: LEADERBOARD_TOP_N })
            : t('results.leaderboard')}
        </Text>
        <View style={styles.columns}>
          {columns.map((column) => (
            <View key={column.id} style={styles.column}>
              {column.entries.map((entry) => (
                <View
                  key={entry.playerId}
                  testID="leaderboard-row"
                  style={[
                    styles.row,
                    column.id === 'leading' && styles.rowLeading,
                    entry.color ? { borderLeftColor: entry.color, borderLeftWidth: 5 } : null,
                  ]}
                >
                  <Text style={[styles.rank, column.id === 'leading' && styles.rankLeading]}>
                    #{entry.rank}
                  </Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  {entry.pointsEarned !== undefined && entry.pointsEarned > 0 && (
                    <Text style={styles.gain}>+{entry.pointsEarned}</Text>
                  )}
                  <Text style={styles.score}>{entry.score}</Text>
                  {showRankChange && entry.rankChange !== undefined && (
                    <RankChangeIndicator change={entry.rankChange} />
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      {rest.length > 0 && (
        <View style={styles.fieldSide}>
          <Text style={styles.sectionTitle}>{t('results.theField')}</Text>
          <View testID="field-cloud" style={styles.fieldCloud}>
            <View style={styles.dots} onLayout={onDotsLayout}>
              {dotSize > 0 &&
                rest.map((entry) => (
                  <View
                    key={entry.playerId}
                    testID="field-dot"
                    style={{
                      width: dotSize,
                      height: dotSize,
                      borderRadius: dotSize / 2,
                      backgroundColor: entry.color ?? theme.accent,
                    }}
                  />
                ))}
            </View>
            <Text testID="field-count" style={styles.fieldCount}>
              {t('results.fieldCount', { count: rest.length })}
            </Text>
            <Text style={styles.fieldRange}>
              {fieldHigh === fieldLow
                ? t('results.fieldScoreSingle', { score: fieldHigh })
                : t('results.fieldScoreSpan', { low: fieldLow, high: fieldHigh })}
            </Text>
          </View>

          {biggestClimb && (
            <View style={styles.climbCard}>
              <Text style={styles.climbLabel}>{t('results.biggestClimb')}</Text>
              <Text style={styles.climbValue}>
                {t('results.climbedPlaces', {
                  name: biggestClimb.name,
                  count: biggestClimb.rankChange ?? 0,
                })}
              </Text>
            </View>
          )}

          <Text style={styles.fieldNote}>
            {t('results.notInTopN', { count: LEADERBOARD_TOP_N })}
          </Text>
        </View>
      )}
    </View>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.lg,
    },
    boardSide: {
      flex: 1,
      gap: spacing.sm,
    },
    fieldSide: {
      width: 440,
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.label,
      color: t.inkSoft,
      letterSpacing: 2,
    },
    columns: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.md,
    },
    column: {
      flex: 1,
      gap: spacing.sm,
      // Rows hang off the heading rather than floating mid-screen when a
      // six-player room does not fill the column.
      justifyContent: 'flex-start',
    },
    row: {
      flex: 1,
      // Rows share the column, but a six-player room would otherwise give each
      // one a third of the screen — big enough to read as a card, not a row.
      maxHeight: 128,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    // The first column is the sharp end of the board, so it sits a shade
    // brighter — enough to separate #1–#6 from #7–#12 at a glance.
    rowLeading: {
      backgroundColor: t.chipBg,
    },
    rank: {
      ...typography.h2,
      color: t.inkSoft,
      width: 68,
    },
    rankLeading: {
      color: t.title,
    },
    name: {
      ...typography.h3,
      color: t.ink,
      flex: 1,
    },
    gain: {
      ...typography.label,
      color: t.success,
    },
    score: {
      ...typography.h3,
      color: t.accent,
      width: 96,
      textAlign: 'right',
    },
    fieldCloud: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    dots: {
      flex: 1,
      alignSelf: 'stretch',
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'center',
      justifyContent: 'center',
      gap: DOT_GAP,
      overflow: 'hidden',
    },
    fieldCount: {
      ...typography.h2,
      color: t.ink,
    },
    fieldRange: {
      ...typography.bodyLarge,
      color: t.inkSoft,
    },
    climbCard: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: t.chipBg,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
    },
    climbLabel: {
      ...typography.label,
      color: t.title,
      letterSpacing: 2,
    },
    climbValue: {
      ...typography.h3,
      color: t.ink,
    },
    fieldNote: {
      ...typography.bodySmall,
      color: t.inkSoft,
    },
  });
