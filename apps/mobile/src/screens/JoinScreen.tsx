import { useTranslation } from '@unfairenough/i18n';
import { AVATAR_COLORS, MAX_NAME_LENGTH, randomAvatar } from '@unfairenough/shared';
import {
  Button,
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EmojiSheet } from '../components/EmojiSheet';

export interface JoinAvatar {
  emoji: string;
  color: string;
}

interface JoinScreenProps {
  onJoin: (name: string, avatar: JoinAvatar) => void;
  isConnecting: boolean;
  error: string | null;
  /**
   * Pins the starting badge. Only the preview harness passes it — screenshots
   * have to render the same pixels every run, and a random badge doesn't.
   */
  initialAvatar?: JoinAvatar;
}

/** Swatches per row in the background grid — 6 puts all 18 colours in three rows. */
const SWATCH_COLUMNS = 6;

/** How far the card lifts while the sheet is up, so Join stays reachable. */
const SHEET_LIFT = 26;

export const JoinScreen: React.FC<JoinScreenProps> = ({
  onJoin,
  isConnecting,
  error,
  initialAvatar,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  // A fresh badge on every visit — nobody has to pick to look like someone.
  const [avatar, setAvatar] = useState<JoinAvatar>(() => initialAvatar ?? randomAvatar());
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleJoin = () => {
    const trimmedName = name.trim();
    if (trimmedName.length > 0) {
      onJoin(trimmedName, avatar);
    }
  };

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={sheetOpen ? styles.lifted : null}>
            <Text style={styles.title}>{t('join.join')}</Text>

            <Card style={styles.card}>
              <View style={styles.badgeRow}>
                <Pressable
                  onPress={() => setSheetOpen(true)}
                  style={[styles.badge, { backgroundColor: avatar.color }]}
                  testID="join-badge"
                  accessibilityRole="button"
                  accessibilityLabel={t('join.tapToSwapEmoji')}
                >
                  <Text style={styles.badgeEmoji}>{avatar.emoji}</Text>
                </Pressable>
                <View style={styles.badgeCopy}>
                  <Text style={styles.badgeTitle}>{t('join.yourBadge')}</Text>
                  <Text style={styles.badgeHint}>{t('join.tapToSwapEmoji')}</Text>
                </View>
              </View>

              <Text style={styles.label}>{t('join.whatsYourName')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('join.namePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={MAX_NAME_LENGTH}
                returnKeyType="join"
                onSubmitEditing={handleJoin}
              />

              <Text style={styles.sectionLabel}>{t('join.background')}</Text>
              <View style={styles.swatches}>
                {AVATAR_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setAvatar((a) => ({ ...a, color }))}
                    style={[
                      styles.swatch,
                      { backgroundColor: color },
                      color === avatar.color && styles.swatchSelected,
                    ]}
                    testID={`join-swatch-${color}`}
                  />
                ))}
              </View>

              {error && <Text style={styles.error}>{error}</Text>}

              <Button
                title={isConnecting ? t('join.joining') : t('join.join')}
                onPress={handleJoin}
                disabled={name.trim().length === 0 || isConnecting}
                loading={isConnecting}
                style={styles.button}
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <EmojiSheet
        visible={sheetOpen}
        selected={avatar.emoji}
        onSelect={(emoji) => setAvatar((a) => ({ ...a, emoji }))}
        onClose={() => setSheetOpen(false)}
        title={t('join.pickYourEmoji')}
        doneLabel={t('join.done')}
      />
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  lifted: {
    transform: [{ translateY: -SHEET_LIFT }],
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    padding: spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  badge: {
    width: 68,
    height: 68,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  badgeEmoji: {
    fontSize: 33,
  },
  badgeCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  badgeTitle: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  badgeHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  label: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  swatch: {
    // Eighteen colours divide into three full rows of six, so space-between
    // spreads the columns evenly on every row without a trailing gap.
    width: `${90 / SWATCH_COLUMNS}%`,
    height: 32,
    borderRadius: borderRadius.md,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: '#FFFFFF',
  },
  error: {
    ...typography.bodySmall,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.lg,
  },
});
