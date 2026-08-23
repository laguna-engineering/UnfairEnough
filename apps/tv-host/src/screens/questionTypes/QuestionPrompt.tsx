import { Card, spacing, type ThemeTokens, typography, useTheme } from '@unfairenough/ui';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  type TextLayoutEventData,
  type ViewStyle,
} from 'react-native';

/**
 * The question itself, on its own panel.
 *
 * Every question type shows the same thing at the top of the screen, so it
 * gets the same card: floating the text straight on the background made the
 * question read as a caption rather than the thing the room is answering.
 *
 * Long questions wrap to three-plus lines and grow the card enough to shove
 * the answers off the screen, so measure the rendered line count and drop a
 * size once the text spills past two lines.
 */

interface QuestionPromptProps {
  text: string;
  /** `large` for the types whose answers need no reading — true/false. */
  size?: 'default' | 'large';
  style?: ViewStyle;
}

export const QuestionPrompt: React.FC<QuestionPromptProps> = ({
  text,
  size = 'default',
  style,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [shrink, setShrink] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is an intentional reset trigger
  useEffect(() => {
    setShrink(false);
  }, [text]);

  const handleTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (e.nativeEvent.lines.length > 2) setShrink(true);
  };

  return (
    <Card style={StyleSheet.flatten([styles.card, style])}>
      <Text
        style={[
          styles.text,
          size === 'large' && styles.textLarge,
          shrink && (size === 'large' ? styles.textLargeShrunk : styles.textShrunk),
        ]}
        onTextLayout={handleTextLayout}
      >
        {text}
      </Text>
    </Card>
  );
};

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: {
      padding: spacing.lg,
      alignItems: 'center',
    },
    text: {
      ...typography.h1,
      // Slightly below h1 (32) so a one-line question isn't oversized on the TV.
      fontSize: 30,
      lineHeight: 38,
      color: t.ink,
      textAlign: 'center',
    },
    textShrunk: {
      fontSize: typography.h2.fontSize,
      lineHeight: typography.h2.lineHeight,
    },
    textLarge: {
      fontSize: 44,
      lineHeight: 54,
    },
    textLargeShrunk: {
      fontSize: 32,
      lineHeight: 42,
    },
  });
