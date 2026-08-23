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
import { QuestionPrompt } from './QuestionPrompt';
import { TypeBadge } from './TypeBadge';

/**
 * Starting font size by option length so long answers fit the tile. Needed
 * because the web build ignores adjustsFontSizeToFit (native-only prop),
 * which we still set as a backstop on TV devices.
 */
const tileLabelSizeFor = (text: string) => {
  if (text.length <= 18) return null; // default displayMedium (48)
  if (text.length <= 40) return { fontSize: 36, lineHeight: 42 };
  return { fontSize: 28, lineHeight: 34 };
};

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

      <QuestionPrompt
        text={question.text}
        size={isTrueFalse ? 'large' : 'default'}
        style={styles.prompt}
      />

      <View style={[styles.tiles, isTrueFalse && styles.tilesTrueFalse]}>
        {isTrueFalse ? (
          <>
            <LinearGradient
              colors={gradients.secondary}
              style={[styles.tile, styles.tileTrueFalse]}
            >
              <Text style={styles.glyph}>✓</Text>
              <Text style={styles.tileLabel}>{t('game.trueLabel')}</Text>
            </LinearGradient>
            <LinearGradient colors={gradients.primary} style={[styles.tile, styles.tileTrueFalse]}>
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
              <Text
                style={[styles.tileLabel, tileLabelSizeFor(question.options[0]?.text ?? '')]}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {question.options[0]?.text}
              </Text>
            </LinearGradient>
            <LinearGradient colors={gradients.secondary} style={styles.tile}>
              <View style={styles.letterCircle}>
                <Text style={styles.letterText}>{question.options[1]?.key}</Text>
              </View>
              <Text
                style={[styles.tileLabel, tileLabelSizeFor(question.options[1]?.text ?? '')]}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {question.options[1]?.text}
              </Text>
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
    prompt: {
      marginVertical: spacing.xl,
    },
    tiles: {
      flex: 1,
      flexDirection: 'row',
      gap: spacing.xl,
    },
    // A tick and a four-letter word need nothing like the whole screen, and at
    // full height they dwarf the question — which for true/false is the only
    // thing anyone actually has to read. Cap the pair and centre it instead.
    tilesTrueFalse: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    tile: {
      flex: 1,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    tileTrueFalse: {
      height: 300,
      maxWidth: 520,
    },
    glyph: {
      ...typography.displayLarge,
      fontSize: 72,
      lineHeight: 78,
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
