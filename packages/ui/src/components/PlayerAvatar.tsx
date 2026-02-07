import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface PlayerAvatarProps {
  name: string;
  color: string;
  score?: number;
  size?: 'small' | 'medium' | 'large';
  showScore?: boolean;
}

const darken = (hex: string, amount: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0x00ff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0x0000ff) - Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  color,
  score,
  size = 'medium',
  showScore = false,
}) => {
  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { width: 40, height: 40, fontSize: 16 };
      case 'large':
        return { width: 80, height: 80, fontSize: 32 };
      default:
        return { width: 56, height: 56, fontSize: 24 };
    }
  };

  const sizeStyles = getSizeStyles();
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[color, darken(color, 0.2)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.avatar,
          {
            width: sizeStyles.width,
            height: sizeStyles.height,
          },
        ]}
      >
        <Text style={[styles.initials, { fontSize: sizeStyles.fontSize }]}>{initials}</Text>
      </LinearGradient>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {showScore && score !== undefined && <Text style={styles.score}>{score}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  avatar: {
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  name: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    maxWidth: 80,
    textAlign: 'center',
  },
  score: {
    ...typography.label,
    color: colors.accentYellow,
    marginTop: spacing.xs,
  },
});
