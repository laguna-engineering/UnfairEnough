import { useTranslation } from '@unfairenough/i18n';
import { Button, Card, colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface WelcomeBackScreenProps {
  profile: { displayName: string; totalGames: number; totalWins: number };
  onConfirm: () => void;
  onReject: () => void;
}

export const WelcomeBackScreen: React.FC<WelcomeBackScreenProps> = ({
  profile,
  onConfirm,
  onReject,
}) => {
  const { t } = useTranslation();

  return (
    <ScreenBackground style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.welcomeText}>
          {t('profile.welcomeBack', { name: profile.displayName })}
        </Text>

        <Text style={styles.stats}>
          {t('profile.gamesPlayed', { count: profile.totalGames })}
          {'  ·  '}
          {t('profile.wins', { count: profile.totalWins })}
        </Text>

        <Button
          title={t('profile.joinAs', { name: profile.displayName })}
          onPress={onConfirm}
          style={styles.joinButton}
        />

        <TouchableOpacity onPress={onReject} style={styles.notMeButton}>
          <Text style={styles.notMeText}>{t('profile.notMe')}</Text>
        </TouchableOpacity>
      </Card>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  welcomeText: {
    ...typography.h2,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  stats: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  joinButton: {
    alignSelf: 'stretch',
  },
  notMeButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  notMeText: {
    ...typography.body,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
