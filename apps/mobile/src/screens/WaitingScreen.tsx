import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  Card,
  ScreenBackground,
} from '@unfairenough/ui';
import { useTranslation, type SupportedLanguage } from '@unfairenough/i18n';
import type { WelcomePayload } from '@unfairenough/ws-protocol';

const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'it', label: 'IT' },
];

interface WaitingScreenProps {
  playerInfo: WelcomePayload | null;
  onLanguageChange?: (lang: SupportedLanguage) => void;
}

export const WaitingScreen: React.FC<WaitingScreenProps> = ({ playerInfo, onLanguageChange }) => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = useCallback((lang: SupportedLanguage) => {
    onLanguageChange?.(lang);
  }, [onLanguageChange]);

  return (
    <ScreenBackground style={styles.container}>
      <Card style={styles.card}>
        <View style={[styles.avatar, { backgroundColor: playerInfo?.playerColor }]}>
          <Text style={styles.checkmark}>✓</Text>
        </View>

        <Text style={styles.title}>{t('join.youAreIn')}</Text>

        {playerInfo?.profile ? (
          <View style={styles.profileInfo}>
            <Text style={styles.welcomeBack}>
              {t('profile.welcomeBack', { name: playerInfo.profile.displayName })}
            </Text>
            <Text style={styles.profileStats}>
              {t('profile.gamesPlayed', { count: playerInfo.profile.totalGames })}
              {'  ·  '}
              {t('profile.wins', { count: playerInfo.profile.totalWins })}
            </Text>
          </View>
        ) : (
          <Text style={styles.firstTime}>{t('profile.firstTime')}</Text>
        )}

        <Text style={styles.roomCode}>
          {t('join.room', { code: playerInfo?.roomCode })}
        </Text>

        <View style={styles.waitingContainer}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.waitingText}>
            {t('join.waitingForHost')}
          </Text>
        </View>
      </Card>

      <Text style={styles.hint}>
        {t('join.lookAtTvHint')}
      </Text>

      {onLanguageChange && (
        <View style={styles.languageSwitcher}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleLanguageChange(lang.code)}
              style={[
                styles.languageButton,
                i18n.language === lang.code && styles.languageButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.languageButtonText,
                  i18n.language === lang.code && styles.languageButtonTextActive,
                ]}
              >
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  checkmark: {
    fontSize: 40,
    color: colors.textPrimary,
  },
  title: {
    ...typography.h1,
    color: colors.success,
    marginBottom: spacing.md,
  },
  profileInfo: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcomeBack: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  profileStats: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  firstTime: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  roomCode: {
    ...typography.h3,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  waitingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  languageSwitcher: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  languageButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  languageButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  languageButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  languageButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
