import { useTranslation } from '@unfairenough/i18n';
import { colors, ScreenBackground, spacing, typography } from '@unfairenough/ui';
import type React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GuestSession } from '../services/authStorage';

interface Props {
  session: GuestSession;
  error: string | null;
  onPlay: () => void;
  onDisconnect: () => void;
}

export const ReturningUserScreen: React.FC<Props> = ({ session, error, onPlay, onDisconnect }) => {
  const { t } = useTranslation();

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('returning.title')}</Text>

      <View style={styles.card}>
        {session.hostDisplayName ? (
          <Text style={styles.serverLabel}>{session.hostDisplayName}</Text>
        ) : (
          <Text style={styles.serverLabel}>{session.serverUrl}</Text>
        )}

        <View style={styles.playerRow}>
          <View style={[styles.avatar, { backgroundColor: session.playerColor }]}>
            {session.playerEmoji ? (
              <Text style={styles.avatarEmoji}>{session.playerEmoji}</Text>
            ) : null}
          </View>
          <Text style={styles.playerName}>{session.playerName}</Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable style={styles.playButton} onPress={onPlay}>
        <Text style={styles.playButtonText}>{t('returning.play')}</Text>
      </Pressable>

      <Pressable style={styles.disconnectButton} onPress={onDisconnect}>
        <Text style={styles.disconnectText}>{t('returning.disconnect')}</Text>
      </Pressable>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    marginBottom: spacing.xl,
  },
  serverLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  playerName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  playButtonText: {
    ...typography.h3,
    color: '#fff',
  },
  disconnectButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  disconnectText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
