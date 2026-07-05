import type { AnswerKey } from '@unfairenough/ws-protocol';
import type React from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { borderRadius, spacing } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import type { AnswerTile, ThemeTokens } from '../theme/themes';
import { typography } from '../theme/typography';

export type AnswerState = 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled';

export interface AnswerButtonProps {
  answerKey: AnswerKey;
  text: string;
  state: AnswerState;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export const AnswerButton: React.FC<AnswerButtonProps> = ({
  answerKey,
  text,
  state,
  onPress,
  disabled = false,
  style,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tile = theme.answerTiles[answerKey];

  // Resolve tile colors by state. Default/selected keep the answer's own color;
  // correct/incorrect override to success/error feedback.
  const { bg, ink, badgeBg, badgeInk } = getStateColors(theme, tile, state);
  const dimmed = state === 'disabled' || disabled;

  return (
    <Pressable
      style={(pressState) => [
        styles.button,
        { backgroundColor: bg, opacity: dimmed ? 0.5 : 1 },
        state === 'selected' && styles.selected,
        style,
        (pressState as any).focused && styles.focused,
        pressState.pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled || state === 'disabled'}
    >
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.badgeText, { color: badgeInk }]}>{answerKey}</Text>
      </View>
      <Text style={[styles.text, { color: ink }]} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
};

function getStateColors(theme: ThemeTokens, tile: AnswerTile, state: AnswerState) {
  if (state === 'correct') {
    return { bg: theme.success, ink: '#06331f', badgeBg: '#ffffff', badgeInk: '#1B8A5A' };
  }
  if (state === 'incorrect') {
    return { bg: theme.error, ink: '#3a0d0d', badgeBg: '#ffffff', badgeInk: '#C13636' };
  }
  return { bg: tile.bg, ink: tile.ink, badgeBg: tile.badgeBg, badgeInk: tile.badgeInk };
}

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 3,
      borderColor: 'transparent',
      minHeight: 60,
      overflow: 'hidden',
    },
    selected: {
      borderColor: t.accent,
    },
    focused: {
      borderColor: t.accent,
    },
    pressed: {
      opacity: 0.85,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    badgeText: {
      ...typography.h3,
      fontWeight: '700',
    },
    text: {
      ...typography.body,
      fontWeight: '600',
      flex: 1,
    },
  });
