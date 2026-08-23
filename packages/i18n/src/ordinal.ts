import type { SupportedLanguage } from './index';

/**
 * Formats a rank the way the language writes it: "1st", "2nd", "3rd", "4th" in
 * English, "1°", "2°" in Italian.
 *
 * Deliberately hand-rolled rather than `Intl.PluralRules(..., {type: 'ordinal'})`:
 * ordinal plural rules are not guaranteed on every JS engine the apps run on
 * (Hermes builds ship a trimmed Intl), and with two languages the table is three
 * lines. Adding a third language means extending this function.
 */
export function formatOrdinal(value: number, language: SupportedLanguage | string): string {
  if (language.startsWith('it')) return `${value}°`;
  return `${value}${englishSuffix(value)}`;
}

function englishSuffix(value: number): string {
  // 11th, 12th and 13th break the last-digit rule — as does anything ending in
  // them (111th, 212th).
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';

  switch (Math.abs(value) % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
