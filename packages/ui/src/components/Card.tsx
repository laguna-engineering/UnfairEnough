import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { gradients } from '../theme/colors';
import { borderRadius, shadows, spacing } from '../theme/spacing';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'glow';
  glowColor?: string;
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'default', glowColor }) => {
  const getShadowStyle = () => {
    switch (variant) {
      case 'elevated':
        return shadows.lg;
      case 'glow':
        return shadows.glow(glowColor!);
      default:
        return shadows.md;
    }
  };

  const gradientColors =
    variant === 'elevated' || variant === 'glow' ? gradients.cardElevated : gradients.card;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, getShadowStyle(), style]}
    >
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
