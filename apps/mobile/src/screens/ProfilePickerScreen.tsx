import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type { ProfileSummary } from '@unfairenough/ws-protocol';
import type React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProfilePickerScreenProps {
  profiles: ProfileSummary[];
  onPickProfile: (profileId: string, displayName: string) => void;
  onPlayAsGuest: () => void;
  error: string | null;
}

export const ProfilePickerScreen: React.FC<ProfilePickerScreenProps> = ({
  profiles,
  onPickProfile,
  onPlayAsGuest,
  error,
}) => {
  const { t } = useTranslation();

  const renderProfile = ({ item }: { item: ProfileSummary }) => (
    <TouchableOpacity
      style={styles.profileCard}
      onPress={() => onPickProfile(item.id, item.displayName)}
      activeOpacity={0.7}
    >
      <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
        <Text style={styles.avatarEmoji}>{item.avatarEmoji || item.displayName.charAt(0)}</Text>
      </View>
      <Text style={styles.profileName} numberOfLines={1}>
        {item.displayName}
      </Text>
      {item.totalGames > 0 && (
        <Text style={styles.profileGames}>
          {t('profile.gamesPlayed', { count: item.totalGames })}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('profile.pickProfile')}</Text>

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <FlatList
        data={profiles}
        renderItem={renderProfile}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
      />

      <TouchableOpacity onPress={onPlayAsGuest} style={styles.guestButton}>
        <Text style={styles.guestText}>{t('profile.playAsGuest')}</Text>
      </TouchableOpacity>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  errorCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: 'center',
  },
  list: {
    paddingBottom: spacing.lg,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  profileCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  profileName: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  profileGames: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  guestButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  guestText: {
    ...typography.body,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
