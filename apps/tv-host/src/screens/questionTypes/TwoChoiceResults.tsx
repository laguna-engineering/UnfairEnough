import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  gradients,
  Leaderboard,
  type LeaderboardEntry,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type { AnswerKey, PlayerResult, Question } from '@unfairenough/ws-protocol';
import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScaledLeaderboard } from '../scaled/ScaledLeaderboard';
import { TypeBadge } from './TypeBadge';

interface TwoChoiceResultsProps {
  question: Question & { serverTimestamp: number };
  correctAnswer: AnswerKey;
  playerResults: PlayerResult[];
  leaderboardEntries: LeaderboardEntry[];
  showRankChange: boolean;
  /** Big room: swap the row-per-player board for the top-N-and-bands one. */
  scaled: boolean;
}

export const TwoChoiceResults: React.FC<TwoChoiceResultsProps> = ({
  question,
  correctAnswer,
  playerResults,
  leaderboardEntries,
  showRankChange,
  scaled,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isTrueFalse = question.type === 'true_false';

  const totalPlayers = playerResults.length;
  const pickedCount = (key: AnswerKey) => playerResults.filter((r) => r.answer === key).length;

  const fastest = playerResults
    .filter((r) => r.isCorrect && r.responseTimeMs !== null)
    .sort((a, b) => (a.responseTimeMs ?? 0) - (b.responseTimeMs ?? 0))[0];

  const tileFor = (key: AnswerKey, glyph: string, label: string) => {
    const isCorrect = key === correctAnswer;
    const gradient = isCorrect ? gradients.success : (['#16213e', '#16213e'] as const);
    return (
      <LinearGradient
        key={key}
        colors={gradient}
        style={[styles.tile, isCorrect ? styles.tileGlow : styles.tileDimmed]}
      >
        <Text style={styles.glyph}>{glyph}</Text>
        <Text
          style={styles.tileLabel}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {label}
        </Text>
        {isCorrect && (
          <View style={styles.pickedChip}>
            <Text style={styles.pickedChipText}>
              {t('results.pickedThis', { count: pickedCount(key), total: totalPlayers })}
            </Text>
          </View>
        )}
      </LinearGradient>
    );
  };

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge kind={isTrueFalse ? 'true_false' : 'this_or_that'} />
        <Text style={styles.progress}>
          {t('game.question', {
            current: question.questionNumber,
            total: question.totalQuestions,
          })}
        </Text>
      </View>

      <Text style={styles.correctLabel}>{t('game.correctAnswerLabel')}</Text>

      <View style={styles.tiles}>
        {isTrueFalse
          ? [tileFor('A', '✓', t('game.trueLabel')), tileFor('B', '✕', t('game.falseLabel'))]
          : question.options.slice(0, 2).map((o) => tileFor(o.key, o.key, o.text))}
      </View>

      {fastest && (
        <Text style={styles.footer}>
          {t('results.answeredFastest', { name: fastest.name, points: fastest.pointsEarned })}
        </Text>
      )}

      <View style={styles.leaderboardSection}>
        {scaled ? (
          <ScaledLeaderboard entries={leaderboardEntries} showRankChange={showRankChange} />
        ) : (
          <>
            <Text style={styles.leaderboardTitle}>{t('results.leaderboard')}</Text>
            <Leaderboard entries={leaderboardEntries} showRankChange={showRankChange} showPoints />
          </>
        )}
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
      alignItems: 'center',
      gap: spacing.md,
    },
    progress: {
      ...typography.h2,
      color: t.inkSoft,
    },
    correctLabel: {
      ...typography.h2,
      color: t.success,
      textAlign: 'center',
      marginVertical: spacing.md,
    },
    tiles: {
      flexDirection: 'row',
      gap: spacing.lg,
      height: 128,
    },
    tile: {
      flex: 1,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    tileGlow: {
      shadowColor: '#00D9A5',
      shadowOpacity: 0.5,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: 0 },
    },
    tileDimmed: {
      opacity: 0.4,
    },
    glyph: {
      ...typography.displayLarge,
      fontSize: 40,
      lineHeight: 44,
      color: '#ffffff',
    },
    tileLabel: {
      ...typography.h3,
      color: '#ffffff',
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
    pickedChip: {
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    pickedChipText: {
      ...typography.label,
      color: '#ffffff',
    },
    footer: {
      ...typography.body,
      color: t.inkSoft,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    leaderboardSection: {
      flex: 1,
      marginTop: spacing.lg,
    },
    leaderboardTitle: {
      ...typography.h3,
      color: t.ink,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
  });
