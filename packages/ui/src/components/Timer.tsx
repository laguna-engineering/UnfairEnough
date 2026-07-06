import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

export interface TimerProps {
  seconds: number;
  totalSeconds: number;
  size?: 'small' | 'large';
}

// `large` is the TV question-screen timer, `small` the mobile one. The TV renders
// at roughly half the design canvas's logical width, so the design's absolute ring
// size (168) came out ~2x too big on-device. These values keep the design's
// *proportions* (ring ≈ 2.9x, number ≈ 1.1x the question text) at the TV's scale.
const DIMENSIONS = {
  large: { diameter: 96, stroke: 9, fontSize: 36 },
  small: { diameter: 104, stroke: 10, fontSize: 40 },
} as const;

export const Timer: React.FC<TimerProps> = ({ seconds, totalSeconds, size = 'large' }) => {
  const { theme } = useTheme();
  const progress = Math.max(0, Math.min(1, totalSeconds > 0 ? seconds / totalSeconds : 0));
  const isLow = seconds <= 3;

  // Ring + number share a color so "running out of time" reads at a glance,
  // while staying inside Palette 1.
  const color = isLow ? theme.error : progress < 0.5 ? theme.answerTiles.C.bg : theme.accent;

  const { diameter, stroke, fontSize } = DIMENSIONS[size];
  const r = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - progress);
  const center = diameter / 2;

  return (
    <View style={[styles.container, { width: diameter, height: diameter }]}>
      <Svg width={diameter} height={diameter}>
        {/* Filled hole so the ring reads as a disc on the card */}
        <Circle cx={center} cy={center} r={r - stroke / 2} fill={theme.ringHole} />
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={theme.track}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress arc, starting at 12 o'clock */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.numberWrap}>
          <Text
            style={{ fontFamily: 'Fredoka_600SemiBold', fontSize, color, lineHeight: fontSize }}
          >
            {seconds}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
