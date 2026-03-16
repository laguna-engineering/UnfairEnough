import type { AnswerKey, ClientMessage } from './messages';

const MAX_NAME_LENGTH = 20;
const MAX_TOKEN_LENGTH = 256;
const VALID_ANSWERS: AnswerKey[] = ['A', 'B', 'C', 'D'];
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sanitize player name to prevent XSS and enforce length limits
 */
export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, MAX_NAME_LENGTH).replace(/[<>]/g, '');
}

/**
 * Validate a string is a valid UUID v4
 */
export function isValidUUID(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/**
 * Validate answer is one of A, B, C, D
 */
export function isValidAnswer(answer: unknown): answer is AnswerKey {
  return typeof answer === 'string' && VALID_ANSWERS.includes(answer as AnswerKey);
}

/**
 * Parse and validate incoming client message
 * Throws if message is invalid
 */
export function parseClientMessage(data: unknown): ClientMessage {
  const raw = typeof data === 'string' ? JSON.parse(data) : data;

  if (!raw || typeof raw !== 'object' || !('type' in raw)) {
    throw new Error('Invalid message format');
  }

  const { type, payload } = raw as { type: string; payload?: unknown };

  switch (type) {
    case 'JOIN': {
      if (!payload || typeof payload !== 'object') {
        throw new Error('JOIN requires payload');
      }
      const p = payload as {
        name?: unknown;
        roomCode?: unknown;
        deviceId?: unknown;
        profileId?: unknown;
      };
      const name = sanitizeName(p.name);
      if (!name) {
        throw new Error('Name is required');
      }
      const deviceId =
        typeof p.deviceId === 'string' && isValidUUID(p.deviceId) ? p.deviceId : undefined;
      const profileId =
        typeof p.profileId === 'string' && isValidUUID(p.profileId) ? p.profileId : undefined;
      return {
        type: 'JOIN',
        payload: {
          name,
          roomCode: typeof p.roomCode === 'string' ? p.roomCode.toUpperCase() : undefined,
          deviceId,
          profileId,
        },
      };
    }

    case 'IDENTIFY': {
      if (!payload || typeof payload !== 'object') {
        throw new Error('IDENTIFY requires payload');
      }
      const p = payload as {
        deviceId?: unknown;
        sessionToken?: unknown;
        invitationToken?: unknown;
      };
      if (typeof p.deviceId !== 'string' || !isValidUUID(p.deviceId)) {
        throw new Error('Valid deviceId is required');
      }
      const sessionToken =
        typeof p.sessionToken === 'string' && p.sessionToken.length <= MAX_TOKEN_LENGTH
          ? p.sessionToken
          : undefined;
      const invitationToken =
        typeof p.invitationToken === 'string' && p.invitationToken.length <= MAX_TOKEN_LENGTH
          ? p.invitationToken
          : undefined;
      return {
        type: 'IDENTIFY',
        payload: { deviceId: p.deviceId, sessionToken, invitationToken },
      };
    }

    case 'UNBIND': {
      if (!payload || typeof payload !== 'object') {
        throw new Error('UNBIND requires payload');
      }
      const p = payload as { deviceId?: unknown };
      if (typeof p.deviceId !== 'string' || !isValidUUID(p.deviceId)) {
        throw new Error('Valid deviceId is required');
      }
      return {
        type: 'UNBIND',
        payload: { deviceId: p.deviceId },
      };
    }

    case 'RECONNECT': {
      if (!payload || typeof payload !== 'object') {
        throw new Error('RECONNECT requires payload');
      }
      const p = payload as { playerId?: unknown };
      if (typeof p.playerId !== 'string') {
        throw new Error('playerId is required');
      }
      return {
        type: 'RECONNECT',
        payload: { playerId: p.playerId },
      };
    }

    case 'ANSWER': {
      if (!payload || typeof payload !== 'object') {
        throw new Error('ANSWER requires payload');
      }
      const p = payload as { questionId?: unknown; answer?: unknown };
      if (typeof p.questionId !== 'string') {
        throw new Error('questionId is required');
      }
      if (!isValidAnswer(p.answer)) {
        throw new Error('Invalid answer');
      }
      return {
        type: 'ANSWER',
        payload: { questionId: p.questionId, answer: p.answer },
      };
    }

    case 'LEAVE':
      return { type: 'LEAVE' };

    case 'PING':
      return { type: 'PING' };

    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

/**
 * Generate a secure player ID using crypto.randomUUID
 */
export function generatePlayerId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate 4-character room code using unambiguous characters
 * Excludes 0/O, 1/I/L to prevent confusion
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return code;
}
