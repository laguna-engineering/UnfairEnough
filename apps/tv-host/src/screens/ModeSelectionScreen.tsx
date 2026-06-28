import { useTranslation } from '@unfairenough/i18n';
import { Card, colors, ScreenBackground, spacing, tvSafeArea, typography } from '@unfairenough/ui';
import type React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  onSelectAccount: () => void;
  onSelectLocal: () => void;
  onSelectHosted: () => void;
}

export const ModeSelectionScreen: React.FC<Props> = ({
  onSelectAccount,
  onSelectLocal,
  onSelectHosted,
}) => {
  const { t } = useTranslation();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('mode.title')}</Text>

      <View style={styles.cardsRow}>
        <Pressable
          hasTVPreferredFocus
          style={(state) => [
            styles.cardWrapper,
            (state as any).focused && styles.focused,
            state.pressed && styles.pressed,
          ]}
          onPress={onSelectAccount}
        >
          <Card style={styles.card} variant="glow" glowColor="#10b981">
            <Text style={styles.cardTitle}>{t('mode.account')}</Text>
            <Text style={styles.cardDescription}>{t('mode.accountDescription')}</Text>
          </Card>
        </Pressable>

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
    paddingHorizontal: tvSafeArea.horizontal,
    paddingVertical: tvSafeArea.vertical,
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
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  card: {
    padding: spacing.xl,
    alignItems: 'center',
    minHeight: 220,
    justifyContent: 'flex-start',
  },
  cardTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
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
