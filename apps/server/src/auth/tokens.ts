/**
 * Token generation and hashing utilities.
 * Uses Bun-native crypto APIs (no Node.js "crypto" import).
 */

export function generateSecureToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 hash a token before storing in DB.
 * This ensures that a DB leak does not compromise active tokens.
 */
export function hashToken(token: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(token);
  return hasher.digest('hex');
}
