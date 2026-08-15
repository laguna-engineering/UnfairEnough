import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  colors,
  gradients,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  Timer,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { AnswerKey, Question } from '@unfairenough/ws-protocol';
import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../../utils/color';
import { TypeBadge } from './TypeBadge';

const OPTION_GRADIENTS: Record<AnswerKey, readonly [string, string]> = {
  A: gradients.answerA,
  B: gradients.answerB,
  C: gradients.answerC,
  D: gradients.answerD,
};

interface PredictRoomQuestionProps {
  question: Question & { serverTimestamp: number };
  countdown: number;
  votedCount: number;
  predictedCount: number;
  totalPlayers: number;
}

/** predict_room — the poll options, plus separate vote/predict progress counters. */
export const PredictRoomQuestion: React.FC<PredictRoomQuestionProps> = ({
  question,
  countdown,
  votedCount,
  predictedCount,
  totalPlayers,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const rows: (typeof question.options)[] = [];
  for (let i = 0; i < question.options.length; i += 2) {
    rows.push(question.options.slice(i, i + 2));
  }

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TypeBadge kind="predict_room" />
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

      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.map((o) => o.key).join('-')} style={styles.gridRow}>
            {row.map((option) => (
              <LinearGradient
                key={option.key}
                colors={OPTION_GRADIENTS[option.key]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.optionTile}
              >
                <View style={styles.letterCircle}>
                  <Text style={styles.letterText}>{option.key}</Text>
                </View>
                <Text style={styles.optionText}>{option.text}</Text>
              </LinearGradient>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.countersRow}>
        <View style={[styles.counterPill, { borderColor: withAlpha(colors.primary, 0.5) }]}>
          <Text style={[styles.counterText, { color: colors.primary }]}>
            {t('game.votedCount', { count: votedCount, total: totalPlayers })}
          </Text>
        </View>
        <View style={[styles.counterPill, { borderColor: withAlpha(colors.accent, 0.5) }]}>
          <Text style={[styles.counterText, { color: colors.accent }]}>
            {t('game.predictedCount', { count: predictedCount, total: totalPlayers })}
          </Text>
        </View>
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
    grid: {
      flex: 1,
      gap: spacing.md,
    },
    gridRow: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.md,
    },
    optionTile: {
      flex: 1,
      borderRadius: borderRadius.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    letterCircle: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterText: {
      ...typography.h2,
      color: '#ffffff',
    },
    optionText: {
      ...typography.h2,
      color: '#ffffff',
      flexShrink: 1,
    },
    countersRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.lg,
      marginTop: spacing.lg,
    },
    counterPill: {
      borderWidth: 1.5,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    counterText: {
      ...typography.h3,
    },
  });
