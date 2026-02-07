import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableOpacity,
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
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
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

  const gradientColors = !disabled ? getGradientColors() : null;

  if (gradientColors) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={style}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.button, getSizeStyles()]}
        >
          {loading ? (
            <ActivityIndicator color={getTextColor()} />
          ) : (
            <Text style={[typography.button, { color: getTextColor() }, textStyle]}>{title}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getSizeStyles(),
        { backgroundColor: getBackgroundColor() },
        variant === 'outline' && styles.outline,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text style={[typography.button, { color: getTextColor() }, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    overflow: 'hidden',
  },
  outline: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
});
