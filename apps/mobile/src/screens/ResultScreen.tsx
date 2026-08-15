import { FALSE_KEY, TRUE_KEY } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type { AnswerKey, Question, RoundResult } from '@unfairenough/ws-protocol';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TypeBadge } from '../components/TypeBadge';
import { withAlpha } from '../utils/color';

interface ResultScreenProps {
  result: RoundResult;
  playerId: string;
  confirmedAnswer: AnswerKey | null;
  question: Question | null;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  result,
  playerId,
  confirmedAnswer,
  question,
}) => {
  const type = result.questionType ?? question?.type ?? 'multiple_choice';

  if (type === 'closest_wins') {
    return <ClosestWinsResult result={result} playerId={playerId} question={question} />;
  }

  if (type === 'predict_room') {
    return <PredictRoomResult result={result} playerId={playerId} question={question} />;
  }

  const isTwoChoice = type === 'true_false' || question?.options.length === 2;
  if (isTwoChoice) {
    return (
      <TwoChoiceResult
        result={result}
        playerId={playerId}
        confirmedAnswer={confirmedAnswer}
        question={question}
      />
    );
  }

  return (
    <DefaultResult
      result={result}
      playerId={playerId}
      confirmedAnswer={confirmedAnswer}
      question={question}
    />
  );
};

// ── 3–4 option multiple choice (default, untouched) ────────────────────────

const DefaultResult: React.FC<ResultScreenProps> = ({
  result,
  playerId,
  confirmedAnswer,
  question,
}) => {
  const { t } = useTranslation();
  const myResult = result.playerResults.find((r) => r.playerId === playerId);
  const isCorrect = myResult?.isCorrect ?? false;
  const myRank = result.rankings?.find((r) => r.playerId === playerId)?.rank ?? 0;

  return (
    <ScreenBackground style={styles.container}>
      <Card
        style={styles.card}
        variant="glow"
        glowColor={isCorrect ? colors.success : colors.error}
      >
        {/* Result Icon */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isCorrect ? colors.success : colors.error },
          ]}
        >
          <Text style={styles.icon}>{isCorrect ? '✓' : '✗'}</Text>
        </View>

        {/* Result Text */}
        <Text style={[styles.resultText, { color: isCorrect ? colors.success : colors.error }]}>
          {isCorrect
            ? t('game.correct')
            : confirmedAnswer
              ? t('game.incorrect')
              : t('game.noAnswer')}
        </Text>

        {/* Points Earned */}
        {myResult && isCorrect && (
          <Text style={styles.points}>
            {t('game.points', { points: myResult.pointsEarned })}
            {myResult.difficultyMultiplier > 1.0
              ? myResult.difficultyMultiplier > 1.05
                ? ' ⭐⭐'
                : ' ⭐'
              : ''}
          </Text>
        )}

        {/* Response Time */}
        {myResult?.responseTimeMs && (
          <Text style={styles.time}>{(myResult.responseTimeMs / 1000).toFixed(2)}s</Text>
        )}

        {/* Correct Answer */}
        <View style={styles.correctAnswerContainer}>
          <Text style={styles.correctLabel}>{t('game.correctAnswerIs')}</Text>
          <Text style={styles.correctAnswer}>
            {question?.options.find((o) => o.key === result.correctAnswer)?.text ??
              result.correctAnswer}
          </Text>
        </View>

        {/* Rank */}
        {result.rankings && myRank > 0 && (
          <Text style={styles.rankText}>{t('results.yourRank', { rank: myRank })}</Text>
        )}

        {/* Total Score */}
        {myResult && (
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>{t('game.yourScore')}</Text>
            <Text style={styles.score}>{myResult.totalScore}</Text>
          </View>
        )}
      </Card>

      <Text style={styles.hint}>{t('game.waitingForNextQuestion')}</Text>
    </ScreenBackground>
  );
};

// ── Two-choice: true/false and "this or that" ───────────────────────────────

const TwoChoiceResult: React.FC<ResultScreenProps> = ({
  result,
  playerId,
  confirmedAnswer,
  question,
}) => {
  const { t } = useTranslation();
  const myResult = result.playerResults.find((r) => r.playerId === playerId);
  const isCorrect = myResult?.isCorrect ?? false;
  const myRank = result.rankings?.find((r) => r.playerId === playerId)?.rank ?? 0;
  const isTrueFalse = question?.type === 'true_false';
  const options = isTrueFalse
    ? [
        { key: TRUE_KEY, text: t('game.trueLabel') },
        { key: FALSE_KEY, text: t('game.falseLabel') },
      ]
    : (question?.options.slice(0, 2) ?? []);

  return (
    <ScreenBackground style={styles.container}>
      <Card
        style={styles.card}
        variant="glow"
        glowColor={isCorrect ? colors.success : colors.error}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isCorrect ? colors.success : colors.error },
          ]}
        >
          <Text style={styles.icon}>{isCorrect ? '✓' : '✗'}</Text>
        </View>

        <Text style={[styles.resultText, { color: isCorrect ? colors.success : colors.error }]}>
          {isCorrect
            ? t('game.correct')
            : confirmedAnswer
              ? t('game.incorrect')
              : t('game.noAnswer')}
        </Text>

        {myResult && isCorrect && (
          <Text style={styles.points}>{t('game.points', { points: myResult.pointsEarned })}</Text>
        )}

        <View style={twoChoiceStyles.tiles}>
          {options.map((opt) => {
            const isCorrectTile = opt.key === result.correctAnswer;
            const isMine = opt.key === confirmedAnswer;
            return (
              <View
                key={opt.key}
                style={[twoChoiceStyles.tile, isCorrectTile && twoChoiceStyles.tileCorrect]}
              >
                <Text style={twoChoiceStyles.tileText}>{opt.text}</Text>
                {isMine && (
                  <View style={twoChoiceStyles.pickChip}>
                    <Text style={twoChoiceStyles.pickChipText}>{t('results.yourPick')}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {result.rankings && myRank > 0 && (
          <Text style={styles.rankText}>{t('results.yourRank', { rank: myRank })}</Text>
        )}

        {myResult && (
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>{t('game.yourScore')}</Text>
            <Text style={styles.score}>{myResult.totalScore}</Text>
          </View>
        )}
      </Card>

      <Text style={styles.hint}>{t('game.waitingForNextQuestion')}</Text>
    </ScreenBackground>
  );
};

// ── Closest wins ─────────────────────────────────────────────────────────

const ClosestWinsResult: React.FC<{
  result: RoundResult;
  playerId: string;
  question: Question | null;
}> = ({ result, playerId, question }) => {
  const { t } = useTranslation();
  const myResult = result.playerResults.find((r) => r.playerId === playerId);
  const myRank = result.rankings?.find((r) => r.playerId === playerId)?.rank ?? 0;
  const correctValue = result.correctValue;
  const hasGuess = myResult?.guess != null;
  const offBy = hasGuess && correctValue != null ? Math.abs(myResult!.guess! - correctValue) : null;

  return (
    <ScreenBackground style={styles.container}>
      <TypeBadge
        label={t('game.typeBadgeClosestWins')}
        color={colors.accentYellow}
        questionNumber={question?.questionNumber}
      />

      <View style={cwStyles.answerCard}>
        <Text style={cwStyles.answerLabel}>{t('results.theAnswer')}</Text>
        <Text style={cwStyles.answerValue}>
          {correctValue != null ? correctValue.toLocaleString() : '—'}
        </Text>
      </View>

      <View style={cwStyles.guessRow}>
        <View>
          <Text style={cwStyles.rowLabel}>{t('game.yourGuess')}</Text>
          <Text style={cwStyles.rowValue}>
            {hasGuess ? myResult!.guess!.toLocaleString() : '—'}
          </Text>
        </View>
        <View style={cwStyles.rowRight}>
          <Text style={cwStyles.rowLabel}>{t('results.offBy')}</Text>
          <Text style={[cwStyles.rowValue, { color: colors.error }]}>
            {offBy != null ? offBy.toLocaleString() : '—'}
          </Text>
        </View>
      </View>

      <View style={cwStyles.pointsCard}>
        <Text style={cwStyles.pointsValue}>
          {t('game.points', { points: myResult?.pointsEarned ?? 0 })}
        </Text>
        {myResult?.isClosest && (
          <View style={cwStyles.closestChip}>
            <Text style={cwStyles.closestChipText}>{t('results.closestChip')}</Text>
          </View>
        )}
      </View>

      {result.rankings && myRank > 0 && (
        <Text style={styles.rankText}>{t('results.yourRank', { rank: myRank })}</Text>
      )}

      {myResult && (
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>{t('game.yourScore')}</Text>
          <Text style={styles.score}>{myResult.totalScore}</Text>
        </View>
      )}

      <Text style={styles.hint}>{t('game.waitingForNextQuestion')}</Text>
    </ScreenBackground>
  );
};

// ── Predict the room ─────────────────────────────────────────────────────

const PredictRoomResult: React.FC<{
  result: RoundResult;
  playerId: string;
  question: Question | null;
}> = ({ result, playerId, question }) => {
  const { t } = useTranslation();
  const myResult = result.playerResults.find((r) => r.playerId === playerId);
  const myRank = result.rankings?.find((r) => r.playerId === playerId)?.rank ?? 0;
  const winnerKey = result.winningOptions?.[0];
  const winnerOption = winnerKey ? question?.options.find((o) => o.key === winnerKey) : undefined;
  const totalVotes = Object.values(result.voteCounts ?? {}).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const winnerVotes = winnerKey ? (result.voteCounts?.[winnerKey] ?? 0) : 0;
  const winnerPct =
    totalVotes > 0 && winnerKey ? Math.round((winnerVotes / totalVotes) * 100) : null;

  const myPredictionOption = myResult?.prediction
    ? question?.options.find((o) => o.key === myResult.prediction)
    : undefined;
  const predictedCorrectly = myResult?.predictedCorrectly ?? false;

  return (
    <ScreenBackground style={styles.container}>
      <TypeBadge
        label={t('game.typeBadgePredictRoom')}
        color={colors.accentLavender}
        questionNumber={question?.questionNumber}
      />

      <Text style={prStyles.roomPickedLabel}>{t('results.roomPicked')}</Text>
      {winnerOption && (
        <View style={prStyles.winnerCard}>
          <View style={prStyles.letterCircle}>
            <Text style={prStyles.letterText}>{winnerOption.key}</Text>
          </View>
          <Text style={prStyles.winnerText}>{winnerOption.text}</Text>
          {winnerPct != null && (
            <Text style={prStyles.winnerPct}>{t('results.pctOfRoom', { pct: winnerPct })}</Text>
          )}
        </View>
      )}

      <View style={[prStyles.outcomeCard, predictedCorrectly && prStyles.outcomeCorrect]}>
        {myPredictionOption && (
          <Text style={prStyles.outcomeVote}>
            {t('game.yourVoteWas', { option: myPredictionOption.text })}
          </Text>
        )}
        <Text
          style={[
            prStyles.outcomeStatus,
            { color: predictedCorrectly ? colors.success : colors.textSecondary },
          ]}
        >
          {predictedCorrectly ? t('results.youCalledIt') : t('results.notThisTime')}
        </Text>
        {predictedCorrectly && myResult && (
          <Text style={prStyles.outcomePoints}>
            {t('game.points', { points: myResult.pointsEarned })}
          </Text>
        )}
      </View>

      {result.rankings && myRank > 0 && (
        <Text style={styles.rankText}>{t('results.yourRank', { rank: myRank })}</Text>
      )}

      {myResult && (
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>{t('game.yourScore')}</Text>
          <Text style={styles.score}>{myResult.totalScore}</Text>
        </View>
      )}

      <Text style={prStyles.footer}>{t('results.votesAnonymous')}</Text>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 48,
    color: colors.textPrimary,
  },
  resultText: {
    ...typography.displayMedium,
    marginBottom: spacing.md,
  },
  points: {
    ...typography.h1,
    color: colors.accentYellow,
    marginBottom: spacing.xs,
  },
  time: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  correctAnswerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  correctLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  correctAnswer: {
    ...typography.h2,
    color: colors.success,
  },
  rankText: {
    ...typography.h2,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  scoreContainer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.card,
    width: '100%',
  },
  scoreLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  score: {
    ...typography.displayMedium,
    color: colors.primary,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});

const twoChoiceStyles = StyleSheet.create({
  tiles: {
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tile: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: spacing.md,
    alignItems: 'center',
    opacity: 0.6,
  },
  tileCorrect: {
    borderColor: colors.success,
    backgroundColor: withAlpha(colors.success, 0.14),
    opacity: 1,
  },
  tileText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  pickChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.full,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  pickChipText: {
    ...typography.label,
    fontSize: 11,
    color: colors.textSecondary,
  },
});

const cwStyles = StyleSheet.create({
  answerCard: {
    backgroundColor: withAlpha(colors.accentYellow, 0.16),
    borderWidth: 2,
    borderColor: colors.accentYellow,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  answerLabel: {
    ...typography.label,
    color: '#5a4b00',
    letterSpacing: 2,
  },
  answerValue: {
    ...typography.displayMedium,
    color: '#5a4b00',
    marginTop: spacing.xs,
  },
  guessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  pointsCard: {
    backgroundColor: withAlpha(colors.success, 0.1),
    borderWidth: 2,
    borderColor: colors.success,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  pointsValue: {
    ...typography.h1,
    color: colors.success,
  },
  closestChip: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  closestChipText: {
    ...typography.label,
    color: '#06331f',
  },
});

const prStyles = StyleSheet.create({
  roomPickedLabel: {
    ...typography.label,
    color: colors.textSecondary,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  winnerCard: {
    backgroundColor: withAlpha(colors.accent, 0.12),
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    padding: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  letterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  winnerText: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  winnerPct: {
    ...typography.body,
    color: colors.textSecondary,
  },
  outcomeCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  outcomeCorrect: {
    borderColor: colors.success,
    backgroundColor: withAlpha(colors.success, 0.1),
  },
  outcomeVote: {
    ...typography.body,
    color: colors.textSecondary,
  },
  outcomeStatus: {
    ...typography.h2,
    marginTop: spacing.xs,
  },
  outcomePoints: {
    ...typography.displayMedium,
    color: colors.accentYellow,
    marginTop: spacing.xs,
  },
  footer: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
