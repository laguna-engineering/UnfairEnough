import { useTranslation } from '@unfairenough/i18n';
import { borderRadius, colors, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../../utils/color';

export type QuestionTypeBadgeKind = 'true_false' | 'this_or_that' | 'closest_wins' | 'predict_room';

const BADGE: Record<QuestionTypeBadgeKind, { labelKey: string; accent: string }> = {
  true_false: { labelKey: 'game.typeBadgeTrueFalse', accent: colors.accent },
  this_or_that: { labelKey: 'game.typeBadgeThisOrThat', accent: colors.accentYellow },
  closest_wins: { labelKey: 'game.typeBadgeClosestWins', accent: colors.accentYellow },
  predict_room: { labelKey: 'game.typeBadgePredictRoom', accent: colors.accentLavender },
};

export const TypeBadge: React.FC<{ kind: QuestionTypeBadgeKind }> = ({ kind }) => {
  const { t } = useTranslation();
  const { labelKey, accent } = BADGE[kind];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: withAlpha(accent, 0.12), borderColor: withAlpha(accent, 0.4) },
      ]}
    >
      <Text style={[styles.text, { color: accent }]}>{t(labelKey)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1.5,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    ...typography.label,
    letterSpacing: 2,
  },
});
