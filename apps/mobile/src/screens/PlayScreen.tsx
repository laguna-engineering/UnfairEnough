import { useTranslation } from '@unfairenough/i18n';
import {
  AnswerButton,
  type AnswerState,
  colors,
  ScreenBackground,
  spacing,
  Timer,
  typography,
} from '@unfairenough/ui';
import type { AnswerKey, Question } from '@unfairenough/ws-protocol';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface PlayScreenProps {
  question: Question & { serverTimestamp: number };
  timeRemaining: number;
  confirmedAnswer: AnswerKey | null;
  onSubmitAnswer: (answer: AnswerKey) => void;
}

export const PlayScreen: React.FC<PlayScreenProps> = ({
  question,
  timeRemaining,
  confirmedAnswer,
  onSubmitAnswer,
}) => {
  const { t } = useTranslation();

  const getAnswerState = (key: AnswerKey): AnswerState => {
    if (confirmedAnswer === key) return 'selected';
    if (confirmedAnswer && key !== confirmedAnswer) return 'disabled';
    return 'default';
  };

  return (
    <ScreenBackground style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.questionNumber}>
          {question.questionNumber} / {question.totalQuestions}
        </Text>
        <Timer seconds={timeRemaining} totalSeconds={question.timeLimit} size="small" />
      </View>

      {/* Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.lookAtTv}>{t('game.lookAtTv')}</Text>
        {confirmedAnswer ? (
          <Text style={styles.confirmedText}>{t('game.answerSubmitted')}</Text>
        ) : (
          <Text style={styles.hintText}>{t('game.tapToSelect')}</Text>
        )}
      </View>

      {/* Answer Buttons - 2x2 Grid */}
      <View style={styles.answersContainer}>
        <View style={styles.answerRow}>
          {question.options.slice(0, 2).map((option) => (
            <AnswerButton
              key={option.key}
              answerKey={option.key}
              text={option.text}
              state={getAnswerState(option.key)}
              onPress={() => onSubmitAnswer(option.key)}
              disabled={!!confirmedAnswer}
              style={styles.answerButton}
            />
          ))}
        </View>
        <View style={styles.answerRow}>
          {question.options.slice(2, 4).map((option) => (
            <AnswerButton
              key={option.key}
              answerKey={option.key}
              text={option.text}
              state={getAnswerState(option.key)}
              onPress={() => onSubmitAnswer(option.key)}
              disabled={!!confirmedAnswer}
              style={styles.answerButton}
            />
          ))}
        </View>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  questionNumber: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  lookAtTv: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  hintText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  confirmedText: {
    ...typography.h3,
    color: colors.success,
  },
  answersContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  answerButton: {
    flex: 1,
    minHeight: 100,
  },
});
