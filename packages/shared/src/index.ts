// Shared utilities and types

export { debugLog, isDebugEnabled, setDebugEnabled } from './debug';

export const APP_NAME = 'Unfair Enough!';
export const DEFAULT_QUESTION_TIME_LIMIT = 15;
// Room capacity lives on the server (apps/server/src/room.ts, MAX_PLAYERS env
// var) — it is enforced there and nowhere else, so there is no copy here to
// drift out of sync.
export const MAX_NAME_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;
export const MAX_RECENT_SERVERS = 5;
export const RECENT_SERVERS_STORAGE_KEY = 'unfairenough_recent_servers';
export const LANGUAGE_STORAGE_KEY = 'unfairenough_language';

export {
  AVATAR_COLORS,
  AVATAR_EMOJI_CATEGORIES,
  AVATAR_EMOJIS,
  type AvatarEmojiCategory,
  isAvatarColor,
  isAvatarEmoji,
  RETIRED_AVATAR_EMOJIS,
  randomAvatar,
} from './avatar';
