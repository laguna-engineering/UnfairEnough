import { LinearGradient } from 'expo-linear-gradient';
import type React from 'react';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface ScreenBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const ScreenBackground: React.FC<ScreenBackgroundProps> = ({ children, style }) => {
  const { theme } = useTheme();
  return (
    <LinearGradient
      colors={theme.bgGradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  );
};
