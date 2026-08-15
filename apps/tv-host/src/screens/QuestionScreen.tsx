import { playersSelectors } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  Card,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  Timer,
  typography,
  useTheme,
} from '@unfairenough/ui';
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  type TextLayoutEventData,
  View,
} from 'react-native';
import { useBgMusicContext } from '../hooks/BgMusicContext';
import { useGameController } from '../hooks/useGameController';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { ClosestWinsQuestion } from './questionTypes/ClosestWinsQuestion';
import { PredictRoomQuestion } from './questionTypes/PredictRoomQuestion';
import { TwoChoiceQuestion } from './questionTypes/TwoChoiceQuestion';

export const QuestionScreen: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const {
    state,
    currentQuestion,
    countdown,
    mode,
    serverUrl,
    answeredCount,
    votedCount,
    predictedCount,
  } = useGameController();
  const { pause, resume } = useBgMusicContext();

  // Long questions wrap to 3+ lines at the default h1 size, which grows the card
  // enough to cover the tags below. Measure the rendered line count and shrink the
  // font once the text spills past two lines. Reset whenever the question changes.
  const questionText = currentQuestion?.text;
  const [shrinkQuestion, setShrinkQuestion] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: questionText is an intentional reset trigger
  useEffect(() => {
    setShrinkQuestion(false);
  }, [questionText]);
  const handleQuestionLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (e.nativeEvent.lines.length > 2) setShrinkQuestion(true);
  };

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

  if (currentQuestion.type === 'closest_wins') {
    const players = playersSelectors.selectAll(state.players);
    return (
      <ClosestWinsQuestion
        question={currentQuestion}
        countdown={countdown}
        lockedInCount={answeredCount}
        totalPlayers={totalPlayers}
        players={players}
        lockedInIds={new Set(Object.keys(state.game.answers))}
      />
    );
  }

  if (currentQuestion.type === 'predict_room') {
    return (
      <PredictRoomQuestion
        question={currentQuestion}
        countdown={countdown}
        votedCount={votedCount}
        predictedCount={predictedCount}
        totalPlayers={totalPlayers}
      />
    );
  }

  if (currentQuestion.type === 'true_false' || currentQuestion.options.length === 2) {
    return (
      <TwoChoiceQuestion
        question={currentQuestion}
        countdown={countdown}
        answeredCount={answeredCount}
        totalPlayers={totalPlayers}
      />
    );
  }

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
        <Text
          style={[styles.questionText, shrinkQuestion && styles.questionTextShrunk]}
          onTextLayout={handleQuestionLayout}
        >
          {currentQuestion.text}
        </Text>
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
              style={[styles.optionCard, { backgroundColor: theme.answerTiles[option.key].bg }]}
            >
              <View
                style={[
                  styles.optionBadge,
                  { backgroundColor: theme.answerTiles[option.key].badgeBg },
                ]}
              >
                <Text style={[styles.optionKey, { color: theme.answerTiles[option.key].badgeInk }]}>
                  {option.key}
                </Text>
              </View>
              <Text style={[styles.optionText, { color: theme.answerTiles[option.key].ink }]}>
                {option.text}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.optionsRow}>
          {currentQuestion.options.slice(2, 4).map((option) => (
            <View
              key={option.key}
              style={[styles.optionCard, { backgroundColor: theme.answerTiles[option.key].bg }]}
            >
              <View
                style={[
                  styles.optionBadge,
                  { backgroundColor: theme.answerTiles[option.key].badgeBg },
                ]}
              >
                <Text style={[styles.optionKey, { color: theme.answerTiles[option.key].badgeInk }]}>
                  {option.key}
                </Text>
              </View>
              <Text style={[styles.optionText, { color: theme.answerTiles[option.key].ink }]}>
                {option.text}
              </Text>
            </View>
          ))}
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
      marginBottom: spacing.md,
    },
    progress: {
      ...typography.h2,
      color: t.inkSoft,
    },
    answeredCount: {
      ...typography.h3,
      color: t.inkSoft,
    },
    questionCard: {
      padding: spacing.lg,
      marginBottom: spacing.sm,
      alignItems: 'center',
    },
    questionText: {
      ...typography.h1,
      // Slightly below h1 (32) so a one-line question isn't oversized on the TV.
      fontSize: 30,
      lineHeight: 38,
      color: t.ink,
      textAlign: 'center',
    },
    questionTextShrunk: {
      fontSize: typography.h2.fontSize,
      lineHeight: typography.h2.lineHeight,
    },
    tagsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    tagPill: {
      backgroundColor: t.chipBg,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
    },
    tagText: {
      ...typography.label,
      color: t.chipInk,
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
      borderRadius: borderRadius.full,
      padding: spacing.md,
    },
    optionBadge: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    optionKey: {
      ...typography.h1,
    },
    optionText: {
      ...typography.h3,
      flex: 1,
    },
  });
