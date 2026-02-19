import type { AnswerKey } from '@unfairenough/ws-protocol';
import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, gradients } from '../theme/colors';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type AnswerState = 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled';

export interface AnswerButtonProps {
  answerKey: AnswerKey;
  text: string;
  state: AnswerState;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

const answerGradients: Record<AnswerKey, readonly [string, string]> = {
  A: gradients.answerA,
  B: gradients.answerB,
  C: gradients.answerC,
  D: gradients.answerD,
};

export const AnswerButton: React.FC<AnswerButtonProps> = ({
  answerKey,
  text,
  state,
  onPress,
  disabled = false,
  style,
}) => {
  const getGradientColors = (): readonly [string, string, ...string[]] | null => {
    switch (state) {
      case 'selected':
        return answerGradients[answerKey];
      case 'correct':
        return gradients.success;
      case 'incorrect':
        return gradients.error;
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (state) {
      case 'selected':
        return answerGradients[answerKey][0];
      case 'correct':
        return colors.success;
      case 'incorrect':
        return colors.error;
      default:
        return 'transparent';
    }
  };

  const getOpacity = () => {
    if (state === 'disabled' || disabled) return 0.5;
    return 1;
  };

  const gradientColors = getGradientColors();

  const content = (
    <>
      <Text style={styles.keyLabel}>{answerKey}</Text>
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </>
  );

  return (
    <Pressable
      style={(pressState) => [
        styles.button,
        {
          backgroundColor: gradientColors ? undefined : colors.card,
          borderColor: getBorderColor(),
          opacity: getOpacity(),
        },
        style,
        (pressState as any).focused && styles.focused,
        pressState.pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled || state === 'disabled'}
    >
      {gradientColors && (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientFill}
        />
      )}
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 3,
    borderColor: 'transparent',
    minHeight: 60,
    overflow: 'hidden',
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.lg,
  },
  focused: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
  keyLabel: {
    ...typography.h2,
    color: colors.textPrimary,
    width: 40,
    textAlign: 'center',
    marginRight: spacing.md,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});
