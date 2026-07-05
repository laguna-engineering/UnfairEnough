import type React from 'react';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { typography } from '../theme/typography';

export interface RankChangeIndicatorProps {
  change: number; // positive = moved up, negative = moved down, 0 = same
}

export const RankChangeIndicator: React.FC<RankChangeIndicatorProps> = ({ change }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (change > 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.up}>▲ {change}</Text>
      </View>
    );
  }

  if (change < 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.down}>▼ {Math.abs(change)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.same}>—</Text>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    container: {
      minWidth: 40,
      alignItems: 'center',
    },
    up: {
      ...typography.label,
      color: t.success,
    },
    down: {
      ...typography.label,
      color: t.error,
    },
    same: {
      ...typography.label,
      color: t.inkSoft,
    },
  });
