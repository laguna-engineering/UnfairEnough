import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const RevealScreen: React.FC = () => {
  const { t } = useTranslation();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.text}>{t('game.letsSee')}</Text>
      <View style={styles.dots}>
        <Text style={styles.dot}>.</Text>
        <Text style={styles.dot}>.</Text>
        <Text style={styles.dot}>.</Text>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    ...typography.displayLarge,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dot: {
    fontSize: 80,
    color: colors.secondary,
  },
});
