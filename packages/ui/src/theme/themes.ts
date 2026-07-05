// Palette 1 — light + dark theme token sets.
// colorhunt base: FE9EC7 / F9F6C4 / 89D4FF / 44ACFF.
// Answer-tile colors are identical in both themes; everything else swaps.

import type { ViewStyle } from 'react-native';

// Tuple type so LinearGradient's `colors` prop accepts these (see CLAUDE.md).
export type Grad3 = readonly [string, string, string];

export interface AnswerTile {
  bg: string;
  ink: string;
  badgeBg: string;
  badgeInk: string;
}

export type AnswerTiles = Record<'A' | 'B' | 'C' | 'D', AnswerTile>;

type CardShadow = Required<
  Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>
>;

export interface ThemeTokens {
  mode: 'dark' | 'light';
  bgGradient: Grad3;
  ink: string;
  inkSoft: string;
  card: string;
  cardBorder: string;
  cardShadow: CardShadow;
  cta: string;
  ctaInk: string;
  title: string;
  accent: string;
  accentOn: string;
  track: string;
  ringHole: string;
  success: string;
  error: string;
  chipBg: string;
  chipInk: string;
  segTrack: string;
  accentSoft: string;
  accentInk: string;
  pcolor: string;
  answerTiles: AnswerTiles;
}

// Shared across both themes.
export const answerTiles: AnswerTiles = {
  A: { bg: '#FE9EC7', ink: '#48132f', badgeBg: '#ffffff', badgeInk: '#E0407F' },
  B: { bg: '#89D4FF', ink: '#0b2f45', badgeBg: '#ffffff', badgeInk: '#1E8FD1' },
  C: { bg: '#FFE27A', ink: '#5a4b00', badgeBg: '#ffffff', badgeInk: '#C99A16' },
  D: { bg: '#44ACFF', ink: '#ffffff', badgeBg: '#ffffff', badgeInk: '#1E7FD4' },
};

// Soft coral used for a wrong answer / error in both themes.
const ERROR = '#FF6B6B';

export const darkTheme: ThemeTokens = {
  mode: 'dark',
  bgGradient: ['#123056', '#0b1e3a', '#0e2647'] as const,
  ink: '#ffffff',
  inkSoft: 'rgba(255,255,255,0.68)',
  card: 'rgba(255,255,255,0.055)',
  cardBorder: 'rgba(255,255,255,0.13)',
  cardShadow: {
    shadowColor: '#030e20',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5,
    shadowRadius: 60,
    elevation: 12,
  },
  cta: '#F5619E',
  ctaInk: '#ffffff',
  title: '#FE9EC7',
  accent: '#89D4FF',
  accentOn: '#06243f',
  track: 'rgba(255,255,255,0.14)',
  ringHole: '#102a4b',
  success: '#7BE0B6',
  error: ERROR,
  chipBg: 'rgba(255,255,255,0.12)',
  chipInk: '#cfe8ff',
  segTrack: 'rgba(255,255,255,0.08)',
  accentSoft: 'rgba(137,212,255,0.2)',
  accentInk: '#bfe6ff',
  pcolor: '#89D4FF',
  answerTiles,
};

export const lightTheme: ThemeTokens = {
  mode: 'light',
  bgGradient: ['#ffffff', '#eef7ff', '#f6fbff'] as const,
  ink: '#14284a',
  inkSoft: 'rgba(20,40,74,0.55)',
  card: '#ffffff',
  cardBorder: 'rgba(60,120,190,0.14)',
  cardShadow: {
    shadowColor: '#508cc8',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.16,
    shadowRadius: 50,
    elevation: 8,
  },
  cta: '#F5619E',
  ctaInk: '#ffffff',
  title: '#F5619E',
  accent: '#44ACFF',
  accentOn: '#ffffff',
  track: 'rgba(68,172,255,0.16)',
  ringHole: '#ffffff',
  success: '#2FB07A',
  error: ERROR,
  chipBg: '#EAF6FF',
  chipInk: '#2E86C9',
  segTrack: '#eaf4ff',
  accentSoft: '#EAF6FF',
  accentInk: '#2E86C9',
  pcolor: '#44ACFF',
  answerTiles,
};

export const themes = { dark: darkTheme, light: lightTheme } as const;
export type ThemeMode = keyof typeof themes;
