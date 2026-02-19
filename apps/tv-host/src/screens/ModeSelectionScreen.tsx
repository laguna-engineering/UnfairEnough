import { useTranslation } from '@unfairenough/i18n';
import { Card, colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const TV_SAFE_HORIZONTAL = 96;
const TV_SAFE_VERTICAL = 54;

interface Props {
  onSelectLocal: () => void;
  onSelectHosted: () => void;
}

export const ModeSelectionScreen: React.FC<Props> = ({ onSelectLocal, onSelectHosted }) => {
  const { t } = useTranslation();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('mode.title')}</Text>

      <View style={styles.cardsRow}>
        <Pressable
          style={(state) => [
            styles.cardWrapper,
            (state as any).focused && styles.focused,
            state.pressed && styles.pressed,
          ]}
          onPress={onSelectLocal}
        >
          <Card style={styles.card} variant="glow" glowColor={colors.secondary}>
            <Text style={styles.cardTitle}>{t('mode.local')}</Text>
            <Text style={styles.cardDescription}>{t('mode.localDescription')}</Text>
          </Card>
        </Pressable>

        <Pressable
          style={(state) => [
            styles.cardWrapper,
            (state as any).focused && styles.focused,
            state.pressed && styles.pressed,
          ]}
          onPress={onSelectHosted}
        >
          <Card style={styles.card} variant="glow" glowColor={colors.primary}>
            <Text style={styles.cardTitle}>{t('mode.hosted')}</Text>
            <Text style={styles.cardDescription}>{t('mode.hostedDescription')}</Text>
          </Card>
        </Pressable>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: TV_SAFE_HORIZONTAL,
    paddingVertical: TV_SAFE_VERTICAL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.displayMedium,
    color: colors.primary,
    marginBottom: spacing.xxl,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  cardWrapper: {
    flex: 1,
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  card: {
    padding: spacing.xl,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  focused: {
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
});
