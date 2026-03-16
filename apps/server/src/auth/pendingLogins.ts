/**
 * In-memory store for device-flow pending TV logins.
 * Short-lived (5 min TTL), lost on server restart — by design.
 */

import type { ServerWebSocket } from 'bun';
import type { WSData } from '../types';
import { generateSecureToken, generateUserCode } from './tokens';

const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PENDING_LOGINS = 100;

export interface PendingLogin {
  userCode: string;
  deviceCode: string;
  hostWs: ServerWebSocket<WSData>;
  hostId: string | null; // set when approved
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

// Keyed by deviceCode (high entropy, for WS matching)
const pendingByDeviceCode = new Map<string, PendingLogin>();
// Keyed by userCode (human-readable, for web form lookup)
const pendingByUserCode = new Map<string, PendingLogin>();

export function createPendingLogin(hostWs: ServerWebSocket<WSData>): {
  userCode: string;
  deviceCode: string;
  expiresIn: number;
} | null {
  if (pendingByDeviceCode.size >= MAX_PENDING_LOGINS) {
    return null;
  }

  const deviceCode = generateSecureToken(32);

  // Generate a unique user code
  let userCode: string;
  do {
    userCode = generateUserCode();
  } while (pendingByUserCode.has(userCode));

  const expiresAt = Date.now() + PENDING_LOGIN_TTL_MS;

  const timer = setTimeout(() => {
    removePendingLogin(deviceCode);
    // Notify TV that the code expired
    try {
      hostWs.send(JSON.stringify({ type: 'AUTH_EXPIRED' }));
    } catch {
      // WS may be closed
    }
  }, PENDING_LOGIN_TTL_MS);

  const pending: PendingLogin = {
    userCode,
    deviceCode,
    hostWs,
    hostId: null,
    expiresAt,
    timer,
  };

  pendingByDeviceCode.set(deviceCode, pending);
  pendingByUserCode.set(userCode, pending);

  return {
    userCode,
    deviceCode,
    expiresIn: Math.floor(PENDING_LOGIN_TTL_MS / 1000),
  };
}

export function approvePendingLogin(userCode: string, hostId: string): PendingLogin | null {
  // Normalize: strip dashes and uppercase
  const normalized = userCode.toUpperCase().replace(/[^A-Z]/g, '');
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  const pending = pendingByUserCode.get(formatted);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) {
    removePendingLogin(pending.deviceCode);
    return null;
  }
  pending.hostId = hostId;
  return pending;
}

export function removePendingLogin(deviceCode: string): void {
  const pending = pendingByDeviceCode.get(deviceCode);
  if (pending) {
    clearTimeout(pending.timer);
    pendingByDeviceCode.delete(pending.deviceCode);
    pendingByUserCode.delete(pending.userCode);
  }
}

/** Clean up if a host WS disconnects before login completes */
export function removePendingLoginByWs(ws: ServerWebSocket<WSData>): void {
  for (const [deviceCode, pending] of pendingByDeviceCode) {
    if (pending.hostWs === ws) {
      removePendingLogin(deviceCode);
      return;
    }
  }
}
