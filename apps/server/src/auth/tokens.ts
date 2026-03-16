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

/**
 * Generate a human-readable 8-char code for the device-flow login.
 * Uses a 20-char consonant alphabet (no vowels to avoid accidental words,
 * no ambiguous chars like 0/O, 1/I/L).
 * Rejection sampling eliminates modulo bias.
 */
export function generateUserCode(): string {
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ';
  const limit = 256 - (256 % alphabet.length); // 240
  const code: string[] = [];
  while (code.length < 8) {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    if (bytes[0] < limit) {
      code.push(alphabet[bytes[0] % alphabet.length]);
    }
  }
  return `${code.slice(0, 4).join('')}-${code.slice(4).join('')}`;
}

/** Generate a SQLite-compatible datetime string N days from now. */
export function sqliteDateFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().replace('T', ' ').replace('Z', '');
}
