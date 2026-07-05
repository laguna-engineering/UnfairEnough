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
import { StyleSheet, Text, View } from 'react-native';

export const RevealScreen: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    text: {
      ...typography.displayLarge,
      color: t.title,
      marginBottom: spacing.lg,
    },
    dots: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    dot: {
      fontSize: 80,
      color: t.accent,
    },
  });
