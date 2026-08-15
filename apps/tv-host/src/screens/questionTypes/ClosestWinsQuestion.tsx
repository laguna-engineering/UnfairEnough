import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  Timer,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { Question } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TypeBadge } from './TypeBadge';

interface ClosestWinsQuestionProps {
  question: Question & { serverTimestamp: number };
  countdown: number;
  lockedInCount: number;
  totalPlayers: number;
  players: { id: string; name: string; color: string }[];
  lockedInIds: Set<string>;
}

/**
 * Closest wins — the TV never shows a value, only the question, range, and how
 * many players have locked in a guess (R7).
 */
export const ClosestWinsQuestion: React.FC<ClosestWinsQuestionProps> = ({
  question,
  countdown,
  lockedInCount,
  totalPlayers,
  players,
  lockedInIds,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const range = question.range ?? { min: 0, max: 0 };

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TypeBadge kind="closest_wins" />
          <Text style={styles.progress}>
            {t('game.question', {
              current: question.questionNumber,
              total: question.totalQuestions,
            })}
          </Text>
        </View>
        <Timer seconds={countdown} totalSeconds={question.timeLimit} size="large" />
      </View>

      <Text style={styles.questionText}>{question.text}</Text>

      <View style={styles.rangePill}>
        <Text style={styles.rangeText}>
          {t('game.rangeBetween', {
            min: range.min.toLocaleString(),
            max: range.max.toLocaleString(),
          })}
        </Text>
      </View>

      <View style={styles.spacer} />

      <Text style={styles.lockedCount}>
        {t('game.lockedInCount', { locked: lockedInCount, total: totalPlayers })}
      </Text>

      <View style={styles.chipsRow}>
        {players.map((player) => {
          const hasGuessed = lockedInIds.has(player.id);
          return (
            <View key={player.id} style={[styles.chip, !hasGuessed && styles.chipDimmed]}>
              <View style={[styles.colorDot, { backgroundColor: player.color }]} />
              <Text style={styles.chipName}>
                {player.name}
                {hasGuessed ? ' ✓' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.footer}>{t('game.guessesSecret')}</Text>
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
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerLeft: {
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
      color: t.ink,
      textAlign: 'center',
      marginVertical: spacing.lg,
    },
    rangePill: {
      alignSelf: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.cardBorder,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    rangeText: {
      ...typography.body,
      color: t.ink,
    },
    spacer: {
      flex: 1,
    },
    lockedCount: {
      ...typography.displayMedium,
      color: t.ink,
      textAlign: 'center',
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    chipDimmed: {
      opacity: 0.35,
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    chipName: {
      ...typography.body,
      color: t.ink,
    },
    footer: {
      ...typography.h3,
      color: t.inkSoft,
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });
