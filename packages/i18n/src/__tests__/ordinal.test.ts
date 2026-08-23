import { describe, expect, test } from 'bun:test';
import { formatOrdinal } from '../ordinal';

describe('formatOrdinal', () => {
  test('uses the English suffix that matches the last digit', () => {
    expect(formatOrdinal(1, 'en')).toBe('1st');
    expect(formatOrdinal(2, 'en')).toBe('2nd');
    expect(formatOrdinal(3, 'en')).toBe('3rd');
    expect(formatOrdinal(4, 'en')).toBe('4th');
  });

  test('spells the teens with "th", not the last-digit suffix', () => {
    // The trap: 11/12/13 look like 1/2/3 but read "eleventh", "twelfth",
    // "thirteenth". A room can reach these ranks, so getting it wrong is visible.
    expect(formatOrdinal(11, 'en')).toBe('11th');
    expect(formatOrdinal(12, 'en')).toBe('12th');
    expect(formatOrdinal(13, 'en')).toBe('13th');
  });

  test('goes back to last-digit suffixes past the teens', () => {
    expect(formatOrdinal(21, 'en')).toBe('21st');
    expect(formatOrdinal(22, 'en')).toBe('22nd');
    expect(formatOrdinal(23, 'en')).toBe('23rd');
    expect(formatOrdinal(24, 'en')).toBe('24th');
    // …including the hundreds, where the teens rule applies again.
    expect(formatOrdinal(111, 'en')).toBe('111th');
    expect(formatOrdinal(101, 'en')).toBe('101st');
  });

  test('writes Italian ordinals with the degree sign', () => {
    expect(formatOrdinal(1, 'it')).toBe('1°');
    expect(formatOrdinal(11, 'it')).toBe('11°');
  });

  test('falls back to English for an unknown language', () => {
    expect(formatOrdinal(3, 'de')).toBe('3rd');
  });
});
