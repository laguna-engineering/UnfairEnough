import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { borderRadius, spacing } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeTokens } from '../theme/themes';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'glow';
  glowColor?: string;
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'default', glowColor }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Flat cards only — no shadow/blur/glow. "glow" now just tints the border so
  // callers can still signal emphasis (e.g. the correct-answer card) without a halo.
  const accent =
    variant === 'glow' && glowColor ? { borderColor: glowColor, borderWidth: 2 } : null;

  return <View style={[styles.card, accent, style]}>{children}</View>;
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.card,
      borderWidth: 1.5,
      borderColor: t.cardBorder,
      borderRadius: borderRadius.xl,
      padding: spacing.md,
      overflow: 'hidden',
    },
  });
