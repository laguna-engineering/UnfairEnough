import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import type { ViewStyle } from 'react-native';
import { gradients } from '../theme/colors';

export interface ScreenBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const ScreenBackground: React.FC<ScreenBackgroundProps> = ({ children, style }) => {
  return (
    <LinearGradient
      colors={gradients.screenBackground}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  );
};
