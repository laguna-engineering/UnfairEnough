import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useGameController } from '../hooks/useGameController';

export const CountdownScreen: React.FC = () => {
  const { t } = useTranslation();
  const { countdown } = useGameController();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.label}>{t('game.getReady')}</Text>
      <Text style={styles.countdown}>{countdown}</Text>
      <Text style={styles.hint}>{t('common.loading')}</Text>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  countdown: {
    fontSize: 200,
    fontWeight: '800',
    color: colors.primary,
    textShadowColor: colors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  hint: {
    ...typography.h2,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
