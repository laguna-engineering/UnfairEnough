import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text } from 'react-native';

interface CountdownScreenProps {
  countdown: number;
}

export const CountdownScreen: React.FC<CountdownScreenProps> = ({ countdown }) => {
  const { t } = useTranslation();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.label}>{t('game.getReady')}</Text>
      <Text style={styles.countdown}>{countdown}</Text>
      <Text style={styles.hint}>{t('game.lookAtTv')}</Text>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  countdown: {
    fontSize: 120,
    fontWeight: '800',
    color: colors.primary,
    textShadowColor: colors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
