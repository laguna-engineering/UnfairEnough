import { defaultGuessStep, FALSE_KEY, TRUE_KEY } from '@unfairenough/game-logic';
import { useTranslation } from '@unfairenough/i18n';
import {
  AnswerButton,
  type AnswerState,
  type AnswerTile,
  answerTiles,
  Button,
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  Timer,
  typography,
} from '@unfairenough/ui';
import type { AnswerKey, Question } from '@unfairenough/ws-protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { TypeBadge } from '../components/TypeBadge';
import { withAlpha } from '../utils/color';

type PlayQuestion = Question & { serverTimestamp: number };

interface PlayScreenProps {
  question: PlayQuestion;
  timeRemaining: number;
  confirmedAnswer: AnswerKey | null;
  confirmedGuess: number | null;
  confirmedVote: AnswerKey | null;
  confirmedPrediction: AnswerKey | null;
  onSubmitAnswer: (answer: AnswerKey) => void;
  onSubmitGuess: (guess: number) => void;
  onSubmitVote: (vote: AnswerKey) => void;
  onSubmitPrediction: (prediction: AnswerKey) => void;
}

function clampToStep(raw: number, min: number, max: number, step: number): number {
  const snapped = step > 0 ? Math.round((raw - min) / step) * step + min : raw;
  return Math.min(max, Math.max(min, snapped));
}

export const PlayScreen: React.FC<PlayScreenProps> = (props) => {
  const { question } = props;

  if (question.type === 'closest_wins') {
    return (
      <ClosestWinsPlay
        question={question}
        timeRemaining={props.timeRemaining}
        confirmedGuess={props.confirmedGuess}
        onSubmitGuess={props.onSubmitGuess}
      />
    );
  }

  if (question.type === 'predict_room') {
    return (
      <PredictRoomPlay
        question={question}
        timeRemaining={props.timeRemaining}
        confirmedVote={props.confirmedVote}
        confirmedPrediction={props.confirmedPrediction}
        onSubmitVote={props.onSubmitVote}
        onSubmitPrediction={props.onSubmitPrediction}
      />
    );
  }

  const isTwoChoice = question.type === 'true_false' || question.options.length === 2;
  if (isTwoChoice) {
    return (
      <TwoChoicePlay
        question={question}
        timeRemaining={props.timeRemaining}
        confirmedAnswer={props.confirmedAnswer}
        onSubmitAnswer={props.onSubmitAnswer}
      />
    );
  }

  return (
    <DefaultMultipleChoicePlay
      question={question}
      timeRemaining={props.timeRemaining}
      confirmedAnswer={props.confirmedAnswer}
      onSubmitAnswer={props.onSubmitAnswer}
    />
  );
};

/** Fades in after a short delay to hide the player's confirmed choice from onlookers. */
const PeekGuard: React.FC<{ active: boolean }> = ({ active }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      setShow(false);
      opacity.setValue(0);
      return;
    }
    const timer = setTimeout(() => {
      setShow(true);
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 500);
    return () => clearTimeout(timer);
  }, [active, opacity]);

  if (!show) return null;
  return (
    <Animated.View style={[styles.peekGuard, { opacity }]} pointerEvents="none">
      <Text style={styles.peekGuardEmoji}>🙈</Text>
      <Text style={styles.peekGuardText}>{t('game.answerSubmitted')}</Text>
    </Animated.View>
  );
};

// ── 3–4 option multiple choice (default, untouched) ────────────────────────

const DefaultMultipleChoicePlay: React.FC<{
  question: PlayQuestion;
  timeRemaining: number;
  confirmedAnswer: AnswerKey | null;
  onSubmitAnswer: (answer: AnswerKey) => void;
}> = ({ question, timeRemaining, confirmedAnswer, onSubmitAnswer }) => {
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

      {/* One full-width row per option. A 2x2 grid halves the width every
          option gets, which is where long answers ran out of room — and it
          left a three-option question with a stray half-width tile. */}
      <View style={styles.answersContainer}>
        {question.options.map((option) => (
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

      <PeekGuard active={!!confirmedAnswer} />
    </ScreenBackground>
  );
};

// ── Two-choice: true/false and "this or that" ───────────────────────────────

const TwoChoicePlay: React.FC<{
  question: PlayQuestion;
  timeRemaining: number;
  confirmedAnswer: AnswerKey | null;
  onSubmitAnswer: (answer: AnswerKey) => void;
}> = ({ question, timeRemaining, confirmedAnswer, onSubmitAnswer }) => {
  const { t } = useTranslation();
  const isTrueFalse = question.type === 'true_false';
  const badgeLabel = isTrueFalse ? t('game.typeBadgeTrueFalse') : t('game.typeBadgeThisOrThat');
  const badgeColor = isTrueFalse ? colors.accent : colors.accentYellow;

  const tiles: { key: AnswerKey; label: string; icon?: string; tile: AnswerTile }[] = isTrueFalse
    ? [
        // Match TV colors: TRUE is blue, FALSE is pink (keys still A/B for scoring)
        { key: TRUE_KEY, icon: '✓', label: t('game.trueLabel'), tile: answerTiles.B },
        { key: FALSE_KEY, icon: '✕', label: t('game.falseLabel'), tile: answerTiles.A },
      ]
    : question.options
        .slice(0, 2)
        .map((opt) => ({ key: opt.key, label: opt.text, tile: answerTiles[opt.key] }));

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge label={badgeLabel} color={badgeColor} questionNumber={question.questionNumber} />
        <Timer seconds={timeRemaining} totalSeconds={question.timeLimit} size="small" />
      </View>

      <Text style={twoChoiceStyles.shieldHint}>{t('game.shieldScreen')}</Text>
      <Text style={twoChoiceStyles.question}>{question.text}</Text>

      <View style={twoChoiceStyles.tilesCol}>
        {tiles.map((item) => {
          const selected = confirmedAnswer === item.key;
          const dim = !!confirmedAnswer && !selected;
          return (
            <Pressable
              key={item.key}
              style={[
                twoChoiceStyles.tile,
                { backgroundColor: item.tile.bg },
                selected && twoChoiceStyles.tileSelected,
                dim && twoChoiceStyles.tileDim,
              ]}
              onPress={() => onSubmitAnswer(item.key)}
              disabled={!!confirmedAnswer}
            >
              {item.icon ? (
                <Text style={[twoChoiceStyles.icon, { color: item.tile.ink }]}>{item.icon}</Text>
              ) : (
                <View style={twoChoiceStyles.letterCircle}>
                  <Text style={twoChoiceStyles.letterCircleText}>{item.key}</Text>
                </View>
              )}
              <Text style={[twoChoiceStyles.tileLabel, { color: item.tile.ink }]}>
                {item.label}
              </Text>
              {selected && (
                <View style={twoChoiceStyles.selectedChip}>
                  <Text style={twoChoiceStyles.selectedChipText}>{t('results.yourPick')}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <PeekGuard active={!!confirmedAnswer} />
    </ScreenBackground>
  );
};

// ── Closest wins: numeric estimate ──────────────────────────────────────────

interface GuessSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const GuessSlider: React.FC<GuessSliderProps> = ({ min, max, step, value, onChange, disabled }) => {
  const trackRef = useRef<View>(null);
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);

  const updateFromX = useCallback(
    (x: number) => {
      const width = trackWidthRef.current;
      if (width <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / width));
      onChange(clampToStep(min + ratio * (max - min), min, max, step));
    },
    [min, max, step, onChange],
  );

  // The PanResponder is created once and would otherwise close over the first
  // render's updateFromX/disabled — stale range and lock state on later
  // questions — so gesture callbacks read the latest values through refs.
  const updateRef = useRef(updateFromX);
  updateRef.current = updateFromX;
  const disabledRef = useRef(!!disabled);
  disabledRef.current = !!disabled;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        // Work in page coordinates: locationX on move events can be relative
        // to the child under the finger (fill/thumb), which makes the thumb
        // jump while dragging.
        const { pageX } = evt.nativeEvent;
        trackRef.current?.measureInWindow((x, _y, width) => {
          trackLeftRef.current = x;
          if (width > 0) trackWidthRef.current = width;
          updateRef.current(pageX - x);
        });
      },
      onPanResponderMove: (_evt, gestureState) => {
        updateRef.current(gestureState.moveX - trackLeftRef.current);
      },
    }),
  ).current;

  const ratio = max > min ? (value - min) / (max - min) : 0;

  return (
    <View
      ref={trackRef}
      testID="guess-slider"
      style={[sliderStyles.touchSurface, sliderWebStyle]}
      onLayout={(e) => {
        trackWidthRef.current = e.nativeEvent.layout.width;
        // On web measureInWindow resolves a frame after the grant handler asks
        // for it, so seed the track origin here or the first drag jumps.
        trackRef.current?.measureInWindow((x) => {
          trackLeftRef.current = x;
        });
      }}
      {...panResponder.panHandlers}
    >
      <View style={sliderStyles.track} pointerEvents="none">
        <View style={[sliderStyles.fill, { width: `${ratio * 100}%` }]} />
        <View style={[sliderStyles.thumb, { left: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
};

const ClosestWinsPlay: React.FC<{
  question: PlayQuestion;
  timeRemaining: number;
  confirmedGuess: number | null;
  onSubmitGuess: (guess: number) => void;
}> = ({ question, timeRemaining, confirmedGuess, onSubmitGuess }) => {
  const { t } = useTranslation();
  const range = question.range ?? { min: 0, max: 100 };
  const step = range.step ?? defaultGuessStep(range.min, range.max);
  const locked = confirmedGuess !== null;

  const [value, setValue] = useState(() =>
    clampToStep(Math.round((range.min + range.max) / 2), range.min, range.max, step),
  );

  useEffect(() => {
    setValue(clampToStep(Math.round((range.min + range.max) / 2), range.min, range.max, step));
  }, [range.min, range.max, step]);

  const displayValue = locked ? confirmedGuess : value;

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge
          label={t('game.typeBadgeClosestWins')}
          color={colors.accentYellow}
          questionNumber={question.questionNumber}
        />
        <Timer seconds={timeRemaining} totalSeconds={question.timeLimit} size="small" />
      </View>

      <Text style={cwStyles.question}>{question.text}</Text>
      <Text style={cwStyles.rangeHint}>
        {t('game.rangeBetween', {
          min: range.min.toLocaleString(),
          max: range.max.toLocaleString(),
        })}
      </Text>

      <Card
        variant={locked ? 'glow' : 'default'}
        glowColor={locked ? colors.success : undefined}
        style={cwStyles.guessCard}
      >
        <Text style={[cwStyles.guessLabel, locked && { color: colors.success }]}>
          {t('game.yourGuess')}
        </Text>
        <Text style={cwStyles.guessValue}>{displayValue.toLocaleString()}</Text>
        {locked && (
          <View style={cwStyles.lockedBadge}>
            <Text style={cwStyles.lockedBadgeText}>✓ {t('game.lockedChip')}</Text>
          </View>
        )}
      </Card>

      <View
        style={[cwStyles.stepRow, locked && cwStyles.disabled]}
        pointerEvents={locked ? 'none' : 'auto'}
      >
        <Pressable
          style={cwStyles.stepBtn}
          onPress={() => setValue((v) => clampToStep(v - step, range.min, range.max, step))}
          disabled={locked}
        >
          <Text style={cwStyles.stepBtnText}>−{step.toLocaleString()}</Text>
        </Pressable>
        <Pressable
          style={cwStyles.stepBtn}
          onPress={() => setValue((v) => clampToStep(v + step, range.min, range.max, step))}
          disabled={locked}
        >
          <Text style={cwStyles.stepBtnText}>+{step.toLocaleString()}</Text>
        </Pressable>
      </View>

      <View
        style={[cwStyles.sliderWrap, locked && cwStyles.disabled]}
        pointerEvents={locked ? 'none' : 'auto'}
      >
        <GuessSlider
          min={range.min}
          max={range.max}
          step={step}
          value={value}
          onChange={setValue}
          disabled={locked}
        />
        <View style={cwStyles.sliderLabels}>
          <Text style={cwStyles.sliderLabelText}>{range.min.toLocaleString()}</Text>
          <Text style={cwStyles.sliderLabelText}>{range.max.toLocaleString()}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <Button
        title={locked ? t('game.lockedIn') : t('game.lockItIn')}
        variant={locked ? 'outline' : 'primary'}
        size="large"
        disabled={locked}
        onPress={() => onSubmitGuess(value)}
      />
      <Text style={cwStyles.footer}>
        {locked ? t('game.lookAtTv') : t('game.closestTakesPoints')}
      </Text>
    </ScreenBackground>
  );
};

// ── Predict the room: vote, then predict ────────────────────────────────────

const PredictRoomPlay: React.FC<{
  question: PlayQuestion;
  timeRemaining: number;
  confirmedVote: AnswerKey | null;
  confirmedPrediction: AnswerKey | null;
  onSubmitVote: (vote: AnswerKey) => void;
  onSubmitPrediction: (prediction: AnswerKey) => void;
}> = ({
  question,
  timeRemaining,
  confirmedVote,
  confirmedPrediction,
  onSubmitVote,
  onSubmitPrediction,
}) => {
  const { t } = useTranslation();
  const step = confirmedVote ? 2 : 1;
  const votedOption = confirmedVote
    ? question.options.find((o) => o.key === confirmedVote)
    : undefined;

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.header}>
        <TypeBadge
          label={t('game.typeBadgePredictRoom')}
          color={colors.accentLavender}
          questionNumber={question.questionNumber}
        />
        <Timer seconds={timeRemaining} totalSeconds={question.timeLimit} size="small" />
      </View>

      {step === 2 && (
        <View style={prStyles.banner}>
          <Text style={prStyles.bannerText}>{t('game.predictionMode')}</Text>
        </View>
      )}

      <View style={prStyles.stepRow}>
        <View
          style={[prStyles.stepChip, step === 1 ? prStyles.stepChipActive : prStyles.stepChipDone]}
        >
          <Text
            style={[
              prStyles.stepChipText,
              step === 1 ? prStyles.stepChipTextActive : prStyles.stepChipTextDone,
            ]}
          >
            1 · {confirmedVote ? `${t('game.stepVoted')} ✓` : t('game.stepVote')}
          </Text>
        </View>
        <View style={[prStyles.stepChip, step === 2 && prStyles.stepChipActivePredict]}>
          <Text style={[prStyles.stepChipText, step === 2 && prStyles.stepChipTextActivePredict]}>
            2 · {t('game.stepPredict')}
          </Text>
        </View>
      </View>

      {step === 1 ? (
        <>
          <Text style={prStyles.title}>{t('game.whatDoYouPick')}</Text>
          <View style={[prStyles.underline, { backgroundColor: colors.primary }]} />
          <View style={prStyles.optionsCol}>
            {question.options.map((opt) => (
              <AnswerButton
                key={opt.key}
                answerKey={opt.key}
                text={opt.text}
                state="default"
                onPress={() => onSubmitVote(opt.key)}
                style={prStyles.answerButton}
              />
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Text style={prStyles.footer}>{t('game.voteAnonymousNext')}</Text>
        </>
      ) : (
        <>
          <Text style={prStyles.title}>{t('game.whatWillRoomPick')}</Text>
          <View style={[prStyles.underline, { backgroundColor: colors.accentLavender }]} />
          {votedOption && !confirmedPrediction && (
            <View style={prStyles.voteReminder}>
              <View style={prStyles.voteReminderDot} />
              <Text style={prStyles.voteReminderText}>
                {t('game.yourVoteWas', { option: votedOption.text })}
              </Text>
            </View>
          )}
          <View style={prStyles.optionsCol}>
            {question.options.map((opt) => {
              const mine = opt.key === confirmedPrediction;
              const dim = !!confirmedPrediction && !mine;
              return (
                <Pressable
                  key={opt.key}
                  style={[
                    prStyles.outlinedTile,
                    mine && prStyles.outlinedTileSelected,
                    dim && prStyles.outlinedTileDim,
                  ]}
                  onPress={() => onSubmitPrediction(opt.key)}
                  disabled={!!confirmedPrediction}
                >
                  <View style={[prStyles.outlinedLetter, mine && prStyles.outlinedLetterSelected]}>
                    <Text
                      style={[
                        prStyles.outlinedLetterText,
                        mine && prStyles.outlinedLetterTextSelected,
                      ]}
                    >
                      {opt.key}
                    </Text>
                  </View>
                  <Text style={prStyles.outlinedText}>{opt.text}</Text>
                  {mine && (
                    <View style={prStyles.yourCallChip}>
                      <Text style={prStyles.yourCallChipText}>{t('game.yourCall')}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <View style={{ flex: 1 }} />
          <Text style={prStyles.footer}>{t('game.scoreByReading')}</Text>
        </>
      )}

      <PeekGuard active={!!confirmedPrediction} />
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
  answerButton: {
    // No `flex` here: in a column the four rows would divide the free vertical
    // space between them and grow to fill it. A floor is enough — a long
    // answer that wraps pushes its own row taller.
    minHeight: 72,
  },
  peekGuard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  peekGuardEmoji: {
    fontSize: 80,
    marginBottom: spacing.md,
  },
  peekGuardText: {
    ...typography.h2,
    color: colors.success,
  },
});

const twoChoiceStyles = StyleSheet.create({
  shieldHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  question: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  tilesCol: {
    flex: 1,
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tileSelected: {
    borderColor: colors.accent,
  },
  tileDim: {
    opacity: 0.4,
  },
  icon: {
    fontSize: 48,
    fontWeight: '700',
  },
  letterCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterCircleText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  tileLabel: {
    ...typography.h2,
    letterSpacing: 3,
  },
  selectedChip: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  selectedChipText: {
    ...typography.label,
    color: '#0d1a2e',
  },
});

// touchAction/userSelect are react-native-web styles: without them mobile-web
// browsers claim vertical-ish drags for page scrolling and desktop drags start
// selecting text, both of which drop the gesture mid-drag.
const sliderWebStyle =
  Platform.OS === 'web'
    ? ({ touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle)
    : undefined;

const sliderStyles = StyleSheet.create({
  touchSurface: {
    height: 48,
    justifyContent: 'center',
  },
  track: {
    height: 14,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    top: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textPrimary,
    borderWidth: 3,
    borderColor: colors.accent,
    transform: [{ translateX: -12 }],
  },
});

const cwStyles = StyleSheet.create({
  question: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  rangeHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  guessCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  guessLabel: {
    ...typography.label,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  guessValue: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  lockedBadge: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  lockedBadgeText: {
    ...typography.label,
    color: '#06331f',
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  stepBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stepBtnText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  sliderWrap: {
    marginTop: spacing.lg,
  },
  disabled: {
    opacity: 0.3,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sliderLabelText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  footer: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

const prStyles = StyleSheet.create({
  banner: {
    backgroundColor: colors.accentLavender,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bannerText: {
    ...typography.label,
    color: '#1a1a2e',
    letterSpacing: 3,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stepChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  stepChipActive: {
    backgroundColor: withAlpha(colors.primary, 0.16),
    borderColor: colors.primary,
  },
  stepChipActivePredict: {
    backgroundColor: withAlpha(colors.accentLavender, 0.16),
    borderColor: colors.accentLavender,
  },
  stepChipDone: {
    backgroundColor: withAlpha(colors.success, 0.1),
  },
  stepChipText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  stepChipTextActive: { color: colors.primary },
  stepChipTextActivePredict: { color: colors.accentLavender },
  stepChipTextDone: { color: colors.success },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  underline: {
    width: 64,
    height: 5,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  voteReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: withAlpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.4),
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  voteReminderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  voteReminderText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  optionsCol: {
    gap: spacing.sm,
  },
  answerButton: {
    minHeight: 60,
  },
  outlinedTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.full,
    padding: spacing.md,
  },
  outlinedTileSelected: {
    borderColor: colors.accentLavender,
    backgroundColor: withAlpha(colors.accentLavender, 0.12),
  },
  outlinedTileDim: {
    opacity: 0.45,
  },
  outlinedLetter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedLetterSelected: {
    borderColor: colors.accentLavender,
  },
  outlinedLetterText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  outlinedLetterTextSelected: {
    color: colors.accentLavender,
  },
  outlinedText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  yourCallChip: {
    backgroundColor: colors.accentLavender,
    borderRadius: borderRadius.full,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  yourCallChipText: {
    ...typography.bodySmall,
    fontSize: 11,
    color: '#1a1a2e',
    letterSpacing: 1,
  },
  footer: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
