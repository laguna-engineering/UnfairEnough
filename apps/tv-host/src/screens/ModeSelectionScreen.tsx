import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  Card,
  ScreenBackground,
} from '@unfairenough/ui';
import { useTranslation } from '@unfairenough/i18n';

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
        <TouchableOpacity style={styles.cardWrapper} onPress={onSelectLocal} activeOpacity={0.8}>
          <Card style={styles.card} variant="glow" glowColor={colors.secondary}>
            <Text style={styles.cardTitle}>{t('mode.local')}</Text>
            <Text style={styles.cardDescription}>{t('mode.localDescription')}</Text>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cardWrapper} onPress={onSelectHosted} activeOpacity={0.8}>
          <Card style={styles.card} variant="glow" glowColor={colors.primary}>
            <Text style={styles.cardTitle}>{t('mode.hosted')}</Text>
            <Text style={styles.cardDescription}>{t('mode.hostedDescription')}</Text>
          </Card>
        </TouchableOpacity>
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
});
