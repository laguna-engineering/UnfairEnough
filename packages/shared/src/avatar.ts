// What a player's badge is made of: one emoji on one background colour.
//
// Single-sourced here because three places need to agree on it — the join
// screen offers the choice, the server validates what comes back over the
// wire, and the admin dashboard writes the same values into a profile.

/**
 * Emoji offered by the join screen's picker, grouped the way its tabs show
 * them. Every glyph has to read twice: at ~28px in the phone grid, and at
 * avatar size on a TV across the room.
 *
 * Fully-qualified sequences only (U+FE0F where the emoji has a text
 * presentation), otherwise Android falls back to the monochrome glyph.
 */
export interface AvatarEmojiCategory {
  /** Stable key — picker tabs and the catalog screenshots both use it. */
  id: 'faces' | 'animals' | 'food' | 'fun';
  /** The glyph shown on the tab itself. */
  icon: string;
  emoji: readonly string[];
}

export const AVATAR_EMOJI_CATEGORIES: readonly AvatarEmojiCategory[] = [
  {
    id: 'faces',
    icon: '😀',
    // biome-ignore format: eight per row, so the set reads as the grid it becomes
    emoji: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳',
      '😏', '🥺', '😢', '😭', '😤', '😠', '🤯', '😱',
      '🥶', '🥵', '😴', '🤤', '🤠', '🤡', '🤖', '👻',
      '💀', '👽', '😈', '🫠', '🫡', '🤫', '🤔', '😬',
    ],
  },
  {
    id: 'animals',
    icon: '🐶',
    // biome-ignore format: eight per row, so the set reads as the grid it becomes
    emoji: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
      '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈',
      '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺',
      '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞',
      '🐢', '🐍', '🦖', '🦕', '🐙', '🦑', '🦐', '🦀',
      '🐡', '🐠', '🐬', '🐳', '🦈', '🐊', '🦓', '🦔',
      '🦦',
    ],
  },
  {
    id: 'food',
    icon: '🍔',
    // biome-ignore format: eight per row, so the set reads as the grid it becomes
    emoji: [
      '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓',
      '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅',
      '🥑', '🥦', '🥕', '🌽', '🌶️', '🥔', '🍠', '🥐',
      '🥖', '🧀', '🥚', '🥓', '🍔', '🍟', '🍕', '🌭',
      '🥪', '🌮', '🌯', '🥗', '🍝', '🍜', '🍣', '🍤',
      '🍦', '🍩', '🍪', '🎂', '🍫', '🍭', '🍿', '🧊',
    ],
  },
  {
    id: 'fun',
    icon: '⚽',
    // biome-ignore format: eight per row, so the set reads as the grid it becomes
    emoji: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱',
      '🏓', '🏸', '🥊', '🥋', '⛳', '🎣', '🎿', '🛹',
      '🏄', '🚴', '🏆', '🥇', '🎯', '🎲', '🎮', '🕹️',
      '🎰', '🧩', '🎸', '🎺', '🥁', '🎹', '🎤', '🎧',
      '🎬', '🎨', '🚀', '🛸', '🌈', '⚡', '🔥', '❄️',
      '⭐', '🌟', '💎', '👑', '🎉', '🎈', '🦾', '🧠',
      '🎪', '🎵',
    ],
  },
];

/** Every emoji the picker offers, flat. */
export const AVATAR_EMOJIS: readonly string[] = AVATAR_EMOJI_CATEGORIES.flatMap((c) => [
  ...c.emoji,
]);

/**
 * Withdrawn from the picker, but still valid on a profile that already has
 * one. The admin dashboard could set these before the picker existed; dropping
 * them outright would make the next edit of such a profile fail validation for
 * a field the editor never touched.
 */
export const RETIRED_AVATAR_EMOJIS: readonly string[] = ['🧔🏼‍♂️', '👩🏻‍⚕️'];

/**
 * Badge backgrounds. The first twelve are the original set the server hands
 * out round-robin when nobody picks; the last six widen the palette now that
 * players choose for themselves and a full room can collide.
 */
export const AVATAR_COLORS = [
  '#FF6B9D',
  '#4ECDC4',
  '#FFE66D',
  '#95E1D3',
  '#F38181',
  '#AA96DA',
  '#FCBAD3',
  '#A8D8EA',
  '#FF9F43',
  '#6C5CE7',
  '#00B894',
  '#FD79A8',
  '#E17055',
  '#B8E986',
  '#5F8FFF',
  '#C56CF0',
  '#17C0EB',
  '#C4A484',
] as const;

/** Accepts anything a profile may legitimately hold, offered or retired. */
export function isAvatarEmoji(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (AVATAR_EMOJIS.includes(value) || RETIRED_AVATAR_EMOJIS.includes(value))
  );
}

export function isAvatarColor(value: unknown): value is string {
  return typeof value === 'string' && (AVATAR_COLORS as readonly string[]).includes(value);
}

/** A fresh badge for a player who hasn't picked one — different every time. */
export function randomAvatar(): { emoji: string; color: string } {
  return {
    emoji: AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  };
}
