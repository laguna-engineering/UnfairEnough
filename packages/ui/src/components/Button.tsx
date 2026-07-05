import { forwardRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type View,
  type ViewStyle,
} from 'react-native';
import { borderRadius, spacing } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
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
    const { theme } = useTheme();
    const styles = useMemo(() => makeStyles(theme), [theme]);

    const getBackgroundColor = () => {
      if (disabled) return theme.card;
      if (variant === 'outline') return 'transparent';
      if (variant === 'secondary') return theme.accent;
      return theme.cta;
    };

    const getTextColor = () => {
      if (disabled) return theme.inkSoft;
      if (variant === 'outline') return theme.accent;
      if (variant === 'secondary') return theme.accentOn;
      return theme.ctaInk;
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

    // Spread the TV focus props so RN's base Pressable types (which don't declare
    // them) don't trip excess-property checks.
    const tvProps = {
      hasTVPreferredFocus,
      nextFocusUp,
      nextFocusDown,
      nextFocusLeft,
      nextFocusRight,
    };

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

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    button: {
      borderRadius: borderRadius.lg,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 120,
      overflow: 'hidden',
    },
    outline: {
      borderColor: t.accent,
    },
    focused: {
      borderColor: t.accent,
    },
    pressed: {
      opacity: 0.85,
    },
  });
