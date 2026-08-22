import { useTranslation } from '@unfairenough/i18n';
import {
  borderRadius,
  ScreenBackground,
  spacing,
  type ThemeTokens,
  tvSafeArea,
  typography,
  useTheme,
} from '@unfairenough/ui';
import type React from 'react';
import { useMemo } from 'react';
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
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // One card per mode. `tint` colors the circular icon badge with a Palette 1
  // answer-tile hue so the three options read as distinct but on-brand.
  const options = [
    {
      key: 'account',
      emoji: '🔑',
      tint: theme.answerTiles.A.bg,
      title: t('mode.account'),
      description: t('mode.accountDescription'),
      onPress: onSelectAccount,
      preferred: true,
    },
    {
      key: 'local',
      emoji: '📺',
      tint: theme.answerTiles.B.bg,
      title: t('mode.local'),
      description: t('mode.localDescription'),
      onPress: onSelectLocal,
      preferred: false,
    },
    {
      key: 'hosted',
      emoji: '🛜',
      tint: theme.answerTiles.D.bg,
      title: t('mode.hosted'),
      description: t('mode.hostedDescription'),
      onPress: onSelectHosted,
      preferred: false,
    },
  ];

  return (
    <ScreenBackground style={styles.container}>
      <Text style={styles.title}>{t('mode.title')}</Text>

      <View style={styles.cardsRow}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            hasTVPreferredFocus={option.preferred}
            onPress={option.onPress}
            style={(state) => [
              styles.card,
              (state as any).focused && styles.focused,
              (state as any).focused && styles.focusedScale,
              state.pressed && styles.pressed,
            ]}
          >
            <View style={[styles.iconBadge, { backgroundColor: option.tint }]}>
              <Text style={styles.iconEmoji}>{option.emoji}</Text>
            </View>
            <Text style={styles.cardTitle}>{option.title}</Text>
            <Text style={styles.cardDescription}>{option.description}</Text>
          </Pressable>
        ))}
      </View>
    </ScreenBackground>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xxl,
      paddingVertical: tvSafeArea.vertical,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...typography.displayLarge,
      color: t.title,
      marginBottom: spacing.xxl,
    },
    cardsRow: {
      flexDirection: 'row',
      alignItems: 'stretch', // stretch every card to the tallest → equal height
      gap: spacing.xl,
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    // The Pressable IS the card: one flat translucent fill, one border, no shadow.
    card: {
      flex: 1,
      maxWidth: 480,
      backgroundColor: t.card,
      borderWidth: 2,
      borderColor: t.cardBorder,
      borderRadius: borderRadius.xl,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBadge: {
      width: 96,
      height: 96,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    iconEmoji: {
      fontSize: 48,
    },
    cardTitle: {
      ...typography.h1,
      color: t.ink,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    cardDescription: {
      ...typography.bodyLarge,
      color: t.inkSoft,
      textAlign: 'center',
    },
    focused: {
      borderColor: t.accent,
    },
    focusedScale: {
      transform: [{ scale: 1.04 }],
    },
    pressed: {
      opacity: 0.85,
    },
  });
