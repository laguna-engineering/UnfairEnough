import { describe, expect, test } from 'bun:test';
import { MAX_NAME_LENGTH } from '@unfairenough/shared';
import { sanitizeName } from '../validation';

/**
 * A player name is typed on a phone and then drawn on a 1080p TV, in rows that
 * assume one line of bounded width. sanitizeName is the only thing standing
 * between the two, and it is what every entry path — hosted JOIN, local-mode
 * JOIN, the admin REST routes — goes through.
 *
 * These tests are about what breaks downstream, not about tidiness: a name
 * that survives with a newline in it splits a leaderboard row, one that
 * survives with a bidi override reorders the text drawn beside it, and one
 * that survives over the cap overflows whatever cell it lands in.
 */

describe('sanitizeName', () => {
  test('keeps an ordinary name untouched', () => {
    expect(sanitizeName('Alice')).toBe('Alice');
  });

  test('keeps accents and emoji — real names use them', () => {
    expect(sanitizeName('José Müller')).toBe('José Müller');
    expect(sanitizeName('Alice 🦊')).toBe('Alice 🦊');
  });

  test('rejects non-strings rather than coercing them', () => {
    // The caller treats '' as "no name" and refuses the JOIN, so a malformed
    // payload must land here and not as the string "null".
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName(undefined)).toBe('');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName({ toString: () => 'Alice' })).toBe('');
  });

  test('caps length so a name cannot overflow the cell it is drawn in', () => {
    expect(sanitizeName('A'.repeat(200))).toHaveLength(MAX_NAME_LENGTH);
  });

  test('caps exactly, even when characters are stripped first', () => {
    // Stripping after the slice would silently shorten this below the cap —
    // the cap has to be the last word on length.
    expect(sanitizeName('<<<<<'.concat('A'.repeat(MAX_NAME_LENGTH)))).toHaveLength(MAX_NAME_LENGTH);
  });

  test('strips angle brackets so a name cannot smuggle markup', () => {
    expect(sanitizeName('<b>Alice</b>')).toBe('bAlice/b');
  });

  test('strips control characters that would break a single-line row', () => {
    const withNewline = `Ali${String.fromCharCode(10)}ce`;
    const withTabAndCr = `Ali${String.fromCharCode(9, 13)}ce`;
    const withNull = `Ali${String.fromCharCode(0)}ce`;
    expect(sanitizeName(withNewline)).toBe('Alice');
    expect(sanitizeName(withTabAndCr)).toBe('Alice');
    expect(sanitizeName(withNull)).toBe('Alice');
  });

  test('strips bidi overrides, which reorder the text drawn around them', () => {
    expect(sanitizeName(`Ali${String.fromCharCode(0x202e)}ce`)).toBe('Alice');
  });

  test('strips zero-width characters, which cost nothing against the cap', () => {
    // 30 zero-width spaces would otherwise eat the whole budget and render blank.
    const padded = `A${String.fromCharCode(0x200b).repeat(30)}B`;
    expect(sanitizeName(padded)).toBe('AB');
  });

  test('collapses whitespace runs so blank-looking names cannot fill a row', () => {
    expect(sanitizeName(`A${' '.repeat(30)}B`)).toBe('A B');
    expect(sanitizeName('   Alice   ')).toBe('Alice');
  });

  test('returns empty for names that are only strippable characters', () => {
    // Empty is the signal callers use to refuse the JOIN outright.
    expect(sanitizeName('     ')).toBe('');
    expect(sanitizeName(String.fromCharCode(0x200b, 0x200b))).toBe('');
    expect(sanitizeName('<>')).toBe('');
  });

  test('never leaves trailing whitespace after the cap trims mid-word', () => {
    const out = sanitizeName(`${'A'.repeat(MAX_NAME_LENGTH - 1)} tail`);
    expect(out).toBe(out.trim());
  });
});
