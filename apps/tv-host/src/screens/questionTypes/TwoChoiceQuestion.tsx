import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  gradients,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  Timer,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { Question } from '@unfairenough/ws-protocol';
import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TypeBadge } from './TypeBadge';

interface TwoChoiceQuestionProps {
  question: Question & { serverTimestamp: number };
  countdown: number;
  answeredCount: number;
  totalPlayers: number;
}

/** true_false and 2-option "this or that" — both render as two big side-by-side tiles. */
export const TwoChoiceQuestion: React.FC<TwoChoiceQuestionProps> = ({
  question,
  countdown,
  answeredCount,
  totalPlayers,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isTrueFalse = question.type === 'true_false';

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TypeBadge kind={isTrueFalse ? 'true_false' : 'this_or_that'} />
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

      <View style={styles.tiles}>
        {isTrueFalse ? (
          <>
            <LinearGradient colors={gradients.secondary} style={styles.tile}>
              <Text style={styles.glyph}>✓</Text>
              <Text style={styles.tileLabel}>{t('game.trueLabel')}</Text>
            </LinearGradient>
            <LinearGradient colors={gradients.primary} style={styles.tile}>
              <Text style={styles.glyph}>✕</Text>
              <Text style={styles.tileLabel}>{t('game.falseLabel')}</Text>
            </LinearGradient>
          </>
        ) : (
          <>
            <LinearGradient colors={gradients.primary} style={styles.tile}>
              <View style={styles.letterCircle}>
                <Text style={styles.letterText}>{question.options[0]?.key}</Text>
              </View>
              <Text style={styles.tileLabel}>{question.options[0]?.text}</Text>
            </LinearGradient>
            <LinearGradient colors={gradients.secondary} style={styles.tile}>
              <View style={styles.letterCircle}>
                <Text style={styles.letterText}>{question.options[1]?.key}</Text>
              </View>
              <Text style={styles.tileLabel}>{question.options[1]?.text}</Text>
            </LinearGradient>
          </>
        )}
      </View>

      <Text style={styles.footer}>
        {t('game.answeredCount', { answered: answeredCount, total: totalPlayers })}
      </Text>
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
      marginVertical: spacing.xl,
    },
    tiles: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.xl,
    },
    tile: {
      flex: 1,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    glyph: {
      ...typography.displayLarge,
      fontSize: 96,
      lineHeight: 100,
      color: '#ffffff',
    },
    letterCircle: {
      width: 76,
      height: 76,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterText: {
      ...typography.h1,
      color: '#ffffff',
    },
    tileLabel: {
      ...typography.displayMedium,
      color: '#ffffff',
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    footer: {
      ...typography.h3,
      color: t.inkSoft,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
