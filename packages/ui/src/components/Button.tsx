import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type View,
  type ViewStyle,
} from 'react-native';
import { colors, gradients } from '../theme/colors';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  hasTVPreferredFocus?: boolean;
  nextFocusUp?: number;
  nextFocusDown?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
}

export const Button = forwardRef<View, ButtonProps>(
  (
    {
      title,
      onPress,
      variant = 'primary',
      size = 'medium',
      disabled = false,
      loading = false,
      style,
      textStyle,
      hasTVPreferredFocus,
      nextFocusUp,
      nextFocusDown,
      nextFocusLeft,
      nextFocusRight,
    },
    ref,
  ) => {
    const getGradientColors = () => {
      if (variant === 'primary') return gradients.primary;
      if (variant === 'secondary') return gradients.secondary;
      return null;
    };

    const getBackgroundColor = () => {
      if (disabled) return colors.card;
      if (variant === 'outline') return 'transparent';
      return colors.primary;
    };

    const getTextColor = () => {
      if (disabled) return colors.textSecondary;
      if (variant === 'outline') return colors.primary;
      return colors.textPrimary;
    };

    const getSizeStyles = (): ViewStyle => {
      switch (size) {
        case 'small':
          return { paddingVertical: spacing.sm, paddingHorizontal: spacing.md };
        case 'large':
          return { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl };
        default:
          return { paddingVertical: spacing.md, paddingHorizontal: spacing.lg };
      }
    };

    const content = loading ? (
      <ActivityIndicator color={getTextColor()} />
    ) : (
      <Text style={[typography.button, { color: getTextColor() }, textStyle]}>{title}</Text>
    );

    const tvProps = {
      hasTVPreferredFocus,
      nextFocusUp,
      nextFocusDown,
      nextFocusLeft,
      nextFocusRight,
    };
    const gradientColors = !disabled ? getGradientColors() : null;

    if (gradientColors) {
      return (
        <Pressable
          ref={ref}
          onPress={onPress}
          disabled={disabled || loading}
          {...tvProps}
          style={(state) => [
            styles.gradientWrapper,
            style,
            (state as any).focused && styles.focused,
            state.pressed && styles.pressed,
          ]}
        >
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.gradientInner, getSizeStyles()]}
          >
            {content}
          </LinearGradient>
        </Pressable>
      );
    }

    return (
      <Pressable
        ref={ref}
        style={(state) => [
          styles.button,
          getSizeStyles(),
          { backgroundColor: getBackgroundColor() },
          variant === 'outline' && styles.outline,
          style,
          (state as any).focused && styles.focused,
          state.pressed && styles.pressed,
        ]}
        onPress={onPress}
        disabled={disabled || loading}
        {...tvProps}
      >
        {content}
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    overflow: 'hidden',
  },
  gradientWrapper: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  gradientInner: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  outline: {
    borderColor: colors.primary,
  },
  focused: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
});
