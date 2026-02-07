import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export interface RankChangeIndicatorProps {
  change: number; // positive = moved up, negative = moved down, 0 = same
}

export const RankChangeIndicator: React.FC<RankChangeIndicatorProps> = ({ change }) => {
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

const styles = StyleSheet.create({
  container: {
    minWidth: 40,
    alignItems: 'center',
  },
  up: {
    ...typography.label,
    color: colors.success,
  },
  down: {
    ...typography.label,
    color: colors.error,
  },
  same: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
