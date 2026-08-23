import { describe, expect, test } from 'bun:test';
import {
  AVATAR_COLORS,
  AVATAR_EMOJI_CATEGORIES,
  AVATAR_EMOJIS,
  isAvatarColor,
  isAvatarEmoji,
  RETIRED_AVATAR_EMOJIS,
  randomAvatar,
} from '../avatar';

/**
 * The join screen offers these; the server validates against them. If the two
 * ever disagree, a player picks a badge, taps Join, and silently gets someone
 * else's colour with no emoji — no error anywhere. These tests exist to make
 * that divergence impossible to ship.
 */

/** What the admin dashboard could already store before the picker existed. */
// biome-ignore format: one line per row, so the old list stays scannable
const LEGACY_ADMIN_EMOJIS = [
  '🐱', '🐶', '🦊', '🐼', '🐰', '🦁', '🐸', '🦄', '🐙', '🎮', '🌟', '⚡', '🔥',
  '❄️', '🎯', '🎪', '🎨', '🎵', '🍕', '🚀', '🧔🏼‍♂️', '🏈', '👩🏻‍⚕️', '🦦', '🧩',
];

describe('avatar catalog', () => {
  test('every emoji the picker shows is one the server accepts', () => {
    // Catches the variation-selector trap: '❄' and '❄️' look identical in a
    // diff and are different strings on the wire.
    for (const category of AVATAR_EMOJI_CATEGORIES) {
      for (const emoji of category.emoji) {
        expect(isAvatarEmoji(emoji)).toBe(true);
      }
    }
  });

  test('no profile that validated before the picker stops validating now', () => {
    // Existing rows in players.avatar_emoji were written against the old list.
    // Dropping any of them would fail the next admin edit of that profile —
    // on a field the editor never touched.
    for (const emoji of LEGACY_ADMIN_EMOJIS) {
      expect(isAvatarEmoji(emoji)).toBe(true);
    }
  });

  test('retired emoji still validate but are never offered', () => {
    // The two skin-toned people were cut from the picker, not from the data.
    for (const emoji of RETIRED_AVATAR_EMOJIS) {
      expect(isAvatarEmoji(emoji)).toBe(true);
      expect(AVATAR_EMOJIS).not.toContain(emoji);
    }
  });

  test('no emoji appears twice', () => {
    // A duplicate renders two identical, separately-selectable cells in the
    // grid — one of which can never show as selected.
    expect(new Set(AVATAR_EMOJIS).size).toBe(AVATAR_EMOJIS.length);
  });

  test('no colour appears twice', () => {
    // Two identical swatches in the background grid are an invisible dead tap.
    expect(new Set(AVATAR_COLORS).size).toBe(AVATAR_COLORS.length);
  });

  test('the swatch grid fills whole rows of six', () => {
    // The join screen lays the colours out six-across with space-between; a
    // count that is not a multiple of six leaves a ragged final row.
    expect(AVATAR_COLORS.length % 6).toBe(0);
  });

  test('a random badge is always one the server will accept', () => {
    for (let i = 0; i < 200; i++) {
      const { emoji, color } = randomAvatar();
      expect(isAvatarEmoji(emoji)).toBe(true);
      expect(isAvatarColor(color)).toBe(true);
    }
  });

  test('a random badge actually varies', () => {
    // "Random every time" is the point — a constant would pass every other
    // test here while giving the whole room the same badge.
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { emoji, color } = randomAvatar();
      seen.add(`${emoji}${color}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('rejects a badge that is not on offer', () => {
    expect(isAvatarEmoji('🫥')).toBe(false);
    expect(isAvatarEmoji('')).toBe(false);
    expect(isAvatarEmoji(undefined)).toBe(false);
    expect(isAvatarColor('#123456')).toBe(false);
    expect(isAvatarColor('red')).toBe(false);
    expect(isAvatarColor(undefined)).toBe(false);
  });
});
