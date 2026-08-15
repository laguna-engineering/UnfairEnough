// Palette 1 — static exports resolve to the DARK theme so any code that imports
// `colors`/`gradients` at module load (all of mobile, plus any un-migrated screen)
// renders the new dark palette with zero changes. Components that need runtime
// light/dark switching read live tokens via `useTheme()` instead.

import { answerTiles, darkTheme } from './themes';

const d = darkTheme;

export const colors = {
  // Back-compat aliases (kept so existing imports keep resolving) → dark Palette 1.
  primary: d.cta, // #F5619E — CTA / focus / active
  secondary: d.accent, // #89D4FF
  accentYellow: answerTiles.C.bg, // #FFE27A
  accentPurple: d.accent, // no purple in Palette 1 → accent blue
  background: '#0b1e3a', // solid dark for SafeAreaView / QR foreground
  card: d.card,
  textPrimary: d.ink,
  textSecondary: d.inkSoft,
  success: d.success,
  error: d.error,

  // New named tokens (dark values) for convenience in un-migrated code.
  ink: d.ink,
  inkSoft: d.inkSoft,
  cardBorder: d.cardBorder,
  cta: d.cta,
  ctaInk: d.ctaInk,
  title: d.title,
  accent: d.accent,
  accentOn: d.accentOn,
  track: d.track,
  ringHole: d.ringHole,
  chipBg: d.chipBg,
  chipInk: d.chipInk,
  segTrack: d.segTrack,
  accentSoft: d.accentSoft,
  accentInk: d.accentInk,

  // Question-type accent (predict-the-room badge). Palette 1 has no purple;
  // lavender is the closest swatch and matches the player-color set.
  accentLavender: '#B79CFF',
};

export const gradients = {
  screenBackground: d.bgGradient,
  card: [d.card, d.card] as const,
  cardElevated: [d.card, d.card] as const,
  primary: [d.cta, '#E0407F'] as const,
  secondary: [d.accent, '#5FBEF0'] as const,
  answerA: [answerTiles.A.bg, answerTiles.A.bg] as const,
  answerB: [answerTiles.B.bg, answerTiles.B.bg] as const,
  answerC: [answerTiles.C.bg, answerTiles.C.bg] as const,
  answerD: [answerTiles.D.bg, answerTiles.D.bg] as const,
  timerHealthy: [d.accent, '#5FBEF0'] as const,
  timerWarning: [answerTiles.C.bg, '#F0C64A'] as const,
  timerDanger: [d.error, '#E84560'] as const,
  winner: [d.title, '#F5C1D8', d.title] as const,
  success: [d.success, '#4FCF9E'] as const,
  error: [d.error, '#E84560'] as const,
};

export const playerColors = [
  '#89D4FF', // Sky blue (accent)
  '#FE9EC7', // Pink
  '#FFE27A', // Yellow
  '#7BE0B6', // Mint
  '#44ACFF', // Blue
  '#F5619E', // Rose
  '#B79CFF', // Lavender
  '#9AE6D0', // Aqua
  '#FFB86B', // Orange
  '#6C8CFF', // Periwinkle
  '#5FD0A8', // Emerald
  '#FF8FB3', // Hot pink
];
