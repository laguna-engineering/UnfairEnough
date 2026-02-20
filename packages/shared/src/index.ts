// Shared utilities and types

export const APP_NAME = 'Unfair Enough!';
export const DEFAULT_QUESTION_TIME_LIMIT = 10;
export const MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 20;
export const ROOM_CODE_LENGTH = 4;
export const MAX_RECENT_SERVERS = 5;
export const RECENT_SERVERS_STORAGE_KEY = 'unfairenough_recent_servers';

export const AVATAR_EMOJIS = [
  '🐱',
  '🐶',
  '🦊',
  '🐼',
  '🐰',
  '🦁',
  '🐸',
  '🦄',
  '🐙',
  '🎮',
  '🌟',
  '⚡',
  '🔥',
  '❄️',
  '🎯',
  '🎪',
  '🎨',
  '🎵',
  '🍕',
  '🚀',
  '🧔🏼‍♂️',
  '🏈',
  '👩🏻‍⚕️',
] as const;

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
] as const;
