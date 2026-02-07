import { TextStyle } from 'react-native';

// Typography scale following Neon Sakura theme
// Sniglet for titles/headings, Nunito for body text

const titleFont = 'Sniglet_400Regular';
const bodyFont = 'Nunito_400Regular';
const bodyFontSemiBold = 'Nunito_600SemiBold';
const bodyFontBold = 'Nunito_700Bold';

export const typography = {
  // Display - Large titles on TV
  displayLarge: {
    fontFamily: titleFont,
    fontSize: 64,
    lineHeight: 72,
  } as TextStyle,

  displayMedium: {
    fontFamily: titleFont,
    fontSize: 48,
    lineHeight: 56,
  } as TextStyle,

  // Headings
  h1: {
    fontFamily: titleFont,
    fontSize: 32,
    lineHeight: 40,
  } as TextStyle,

  h2: {
    fontFamily: titleFont,
    fontSize: 24,
    lineHeight: 32,
  } as TextStyle,

  h3: {
    fontFamily: titleFont,
    fontSize: 20,
    lineHeight: 28,
  } as TextStyle,

  // Body text
  bodyLarge: {
    fontFamily: bodyFont,
    fontSize: 18,
    lineHeight: 26,
  } as TextStyle,

  body: {
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,

  bodySmall: {
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,

  // Timer/Numbers - For game timer display
  timer: {
    fontFamily: titleFont,
    fontSize: 72,
    lineHeight: 80,
  } as TextStyle,

  // Labels
  label: {
    fontFamily: bodyFontSemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.5,
  } as TextStyle,

  // Button text
  button: {
    fontFamily: bodyFontBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.5,
  } as TextStyle,
};
