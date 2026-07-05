import { useTranslation } from '@unfairenough/i18n';
import {
  ScreenBackground,
  spacing,
  type ThemeTokens,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useGameController } from '../hooks/useGameController';

export const CountdownScreen: React.FC = () => {
  const { t } = useTranslation();
  const { countdown } = useGameController();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.label}>{t('game.getReady')}</Text>
      <Text style={styles.countdown}>{countdown}</Text>
      <Text style={styles.hint}>{t('common.loading')}</Text>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    label: {
      ...typography.displayMedium,
      color: t.ink,
      marginBottom: spacing.xl,
    },
    countdown: {
      fontSize: 200,
      fontWeight: '800',
      color: t.title,
    },
    hint: {
      ...typography.h2,
      color: t.inkSoft,
      marginTop: spacing.xl,
    },
  });
