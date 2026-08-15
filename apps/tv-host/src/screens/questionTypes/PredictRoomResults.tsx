import type { Player } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  gradients,
  PlayerAvatar,
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
import { TypeBadge } from './TypeBadge';

const OPTION_GRADIENTS: Record<AnswerKey, readonly [string, string]> = {
  A: gradients.answerA,
  B: gradients.answerB,
  C: gradients.answerC,
  D: gradients.answerD,
};

interface PredictRoomResultsProps {
  question: Question & { serverTimestamp: number };
  playerResults: PlayerResult[];
  players: Player[];
  voteCounts: Partial<Record<AnswerKey, number>>;
  winningOptions: AnswerKey[];
}

export const PredictRoomResults: React.FC<PredictRoomResultsProps> = ({
  question,
  playerResults,
  players,
  voteCounts,
  winningOptions,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const totalVotes = Object.values(voteCounts).reduce((sum, c) => sum + (c ?? 0), 0);
  const calledIt = playerResults.filter((r) => r.predictedCorrectly);
  const emojiById = useMemo(() => new Map(players.map((p) => [p.id, p.emoji])), [players]);
  const colorById = useMemo(() => new Map(players.map((p) => [p.id, p.color])), [players]);

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge kind="predict_room" />
        <Text style={styles.progress}>
          {t('game.question', {
            current: question.questionNumber,
            total: question.totalQuestions,
          })}
        </Text>
      </View>

      <Text style={styles.questionText}>{question.text}</Text>

      <View style={styles.bars}>
        {question.options.map((option) => {
          const count = voteCounts[option.key] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isWinner = winningOptions.includes(option.key);
          return (
            <View key={option.key} style={[styles.barRow, !isWinner && styles.barRowDimmed]}>
              <LinearGradient colors={OPTION_GRADIENTS[option.key]} style={styles.letterCircle}>
                <Text style={styles.letterText}>{option.key}</Text>
              </LinearGradient>
              <View style={styles.barLabelCol}>
                <Text style={styles.optionText}>{option.text}</Text>
                {isWinner && (
                  <View style={styles.winnerChip}>
                    <Text style={styles.winnerChipText}>{t('results.roomsPick')}</Text>
                  </View>
                )}
              </View>
              <View style={[styles.barTrack, isWinner && styles.barTrackGlow]}>
                <LinearGradient
                  colors={OPTION_GRADIENTS[option.key]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.barFill, { width: `${pct}%` }, !isWinner && styles.barFillDimmed]}
                />
              </View>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.calledItRow}>
        <Text style={styles.calledItLabel}>{t('results.calledIt')}</Text>
        {calledIt.length > 0 ? (
          <>
            {calledIt.map((r) => (
              <PlayerAvatar
                key={r.playerId}
                name={r.name}
                color={colorById.get(r.playerId) ?? theme.accent}
                emoji={emojiById.get(r.playerId)}
                size="small"
              />
            ))}
            <Text style={styles.eachPlus}>
              {t('results.eachPlus', { points: calledIt[0]?.pointsEarned ?? 0 })}
            </Text>
          </>
        ) : (
          <Text style={styles.notThisTime}>{t('results.notThisTime')}</Text>
        )}
      </View>

      <Text style={styles.footer}>{t('results.votesAnonymous')}</Text>
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
    questionText: {
      ...typography.h1,
      color: t.ink,
      textAlign: 'center',
      marginVertical: spacing.lg,
    },
    bars: {
      flex: 1,
      justifyContent: 'center',
      gap: spacing.lg,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    barRowDimmed: {
      opacity: 0.5,
    },
    letterCircle: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterText: {
      ...typography.h3,
      color: '#ffffff',
    },
    barLabelCol: {
      width: 220,
    },
    optionText: {
      ...typography.h3,
      color: t.ink,
    },
    winnerChip: {
      alignSelf: 'flex-start',
      marginTop: spacing.xs / 2,
    },
    winnerChipText: {
      ...typography.label,
      backgroundColor: '#FFE27A',
      color: '#1a1a2e',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      overflow: 'hidden',
      letterSpacing: 1,
    },
    barTrack: {
      flex: 1,
      height: 44,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.07)',
      overflow: 'hidden',
    },
    barTrackGlow: {
      shadowColor: t.accent,
      shadowOpacity: 0.5,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 0 },
    },
    barFill: {
      height: '100%',
      borderRadius: borderRadius.full,
    },
    barFillDimmed: {
      opacity: 0.5,
    },
    pctText: {
      ...typography.h3,
      color: t.ink,
      width: 60,
      textAlign: 'right',
    },
    calledItRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    calledItLabel: {
      ...typography.h3,
      color: t.inkSoft,
    },
    eachPlus: {
      ...typography.h3,
      color: '#FFE27A',
      marginLeft: spacing.sm,
    },
    notThisTime: {
      ...typography.h3,
      color: t.inkSoft,
    },
    footer: {
      ...typography.h3,
      color: t.inkSoft,
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });
