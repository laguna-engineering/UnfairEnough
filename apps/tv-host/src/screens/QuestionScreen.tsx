import { playersSelectors } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  Timer,
  typography,
} from '@unfairenough/ui';
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import type React from 'react';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBgMusicContext } from '../hooks/BgMusicContext';
import { useGameController } from '../hooks/useGameController';
import { resolveMediaUrl } from '../utils/mediaUrl';

const answerColors = {
  A: colors.primary,
  B: colors.secondary,
  C: colors.accentYellow,
  D: colors.accentPurple,
};

export const QuestionScreen: React.FC = () => {
  const { t } = useTranslation();
  const { state, currentQuestion, countdown, mode, serverUrl } = useGameController();
  const { pause, resume } = useBgMusicContext();

  // Answer-slot audio: play `play: question` clips during the QUESTION phase.
  // Subject clips play once (then silence until reveal); background music loops.
  const audio = currentQuestion?.audio;
  const audioUrl = audio?.play === 'question' ? resolveMediaUrl(audio.url, mode, serverUrl) : null;
  const shouldLoop = audio?.role === 'background';

  // Duck the ambient app track while the question clip plays; restore at reveal
  // (this screen unmounts on the phase change to REVEALING).
  useEffect(() => {
    if (!audioUrl) return;
    pause();
    return () => resume();
  }, [audioUrl, pause, resume]);

  // Start the clip on phase entry; tear it down on unmount so it never bleeds
  // into the reveal or the next question.
  useEffect(() => {
    if (!audioUrl) return;
    let player: AudioPlayer | null = null;
    try {
      player = createAudioPlayer({ uri: audioUrl });
      player.volume = 1;
      player.loop = shouldLoop;
      player.play();
    } catch {
      // Non-fatal — the question proceeds without audio.
    }
    return () => player?.remove();
  }, [audioUrl, shouldLoop]);

  if (!currentQuestion) return null;

  const totalPlayers = playersSelectors.selectTotal(state.players);
  const answeredCount = Object.keys(state.game.answers).length;

  return (
    <ScreenBackground style={styles.container}>
      {/* Header with timer and progress */}
      <View style={styles.header}>
        <Text style={styles.progress}>
          {t('game.question', {
            current: currentQuestion.questionNumber,
            total: currentQuestion.totalQuestions,
          })}
        </Text>
        <Timer seconds={countdown} totalSeconds={currentQuestion.timeLimit} size="large" />
        <Text style={styles.answeredCount}>
          {t('game.answeredCount', { answered: answeredCount, total: totalPlayers })}
        </Text>
      </View>

      {/* Question */}
      <Card style={styles.questionCard} variant="elevated">
        <Text style={styles.questionText}>{currentQuestion.text}</Text>
      </Card>

      {/* Tags */}
      {currentQuestion.tags && currentQuestion.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {currentQuestion.tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Answer Options - WWTBAM Style */}
      <View style={styles.optionsGrid}>
        <View style={styles.optionsRow}>
          {currentQuestion.options.slice(0, 2).map((option) => (
            <View
              key={option.key}
              style={[styles.optionCard, { borderLeftColor: answerColors[option.key] }]}
            >
              <Text style={[styles.optionKey, { color: answerColors[option.key] }]}>
                {option.key}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </View>
          ))}
        </View>
        <View style={styles.optionsRow}>
          {currentQuestion.options.slice(2, 4).map((option) => (
            <View
              key={option.key}
              style={[styles.optionCard, { borderLeftColor: answerColors[option.key] }]}
            >
              <Text style={[styles.optionKey, { color: answerColors[option.key] }]}>
                {option.key}
              </Text>
              <Text style={styles.optionText}>{option.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  progress: {
    ...typography.h2,
    color: colors.textSecondary,
  },
  answeredCount: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  questionCard: {
    padding: spacing.lg,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  questionText: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tagPill: {
    backgroundColor: `${colors.accentPurple}33`,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  tagText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  optionsGrid: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 6,
    padding: spacing.md,
  },
  optionKey: {
    ...typography.h1,
    marginRight: spacing.md,
  },
  optionText: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
});
