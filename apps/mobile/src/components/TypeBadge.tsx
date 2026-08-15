import { borderRadius, colors, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../utils/color';

export interface TypeBadgeProps {
  /** Localized type label, e.g. "TRUE OR FALSE". */
  label: string;
  /** Accent color for this question type. */
  color: string;
  /** When set, prefixes the label with "Q{n} · ". */
  questionNumber?: number;
}

/** Small pill badge naming the current question's type, colored by accent. */
export const TypeBadge: React.FC<TypeBadgeProps> = ({ label, color, questionNumber }) => (
  <View
    style={[
      styles.badge,
      { backgroundColor: withAlpha(color, 0.12), borderColor: withAlpha(color, 0.4) },
    ]}
  >
    <Text style={[styles.text, { color }]} numberOfLines={1}>
      {questionNumber != null ? `Q${questionNumber} · ${label}` : label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  text: {
    ...typography.label,
    letterSpacing: 1.5,
    color: colors.textPrimary,
  },
});
