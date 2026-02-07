import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, gradients } from '../theme/colors';
import { typography } from '../theme/typography';

export interface TimerProps {
  seconds: number;
  totalSeconds: number;
  size?: 'small' | 'large';
}

export const Timer: React.FC<TimerProps> = ({ seconds, totalSeconds, size = 'large' }) => {
  const progress = seconds / totalSeconds;
  const isLow = seconds <= 3;

  const getColor = () => {
    if (isLow) return colors.error;
    if (progress < 0.5) return colors.accentYellow;
    return colors.secondary;
  };

  const getGradientColors = () => {
    if (isLow) return gradients.timerDanger;
    if (progress < 0.5) return gradients.timerWarning;
    return gradients.timerHealthy;
  };

  const textStyle = size === 'large' ? typography.timer : typography.displayMedium;

  return (
    <View style={styles.container}>
      <Text style={[textStyle, { color: getColor() }]}>{seconds}</Text>
      <View style={styles.progressContainer}>
        <LinearGradient
          colors={getGradientColors()}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressBar, { width: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  progressContainer: {
    width: 200,
    height: 8,
    backgroundColor: colors.card,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
});
