import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import type { DbAdapter } from '@unfairenough/db';
import {
  configurePragmas,
  createBunAdapter,
  hostsRepo,
  runMigrations,
  sessionsRepo,
} from '@unfairenough/db';
import { Hono } from 'hono';
import { createAuthMiddleware, extractToken, SESSION_COOKIE } from '../auth/middleware';
import { generateSecureToken, hashToken } from '../auth/tokens';
import authRoutes from '../routes/auth';

// Patch getDb to use our in-memory DB
let db: DbAdapter;
let rawDb: InstanceType<typeof Database>;

// We need to build a mini Hono app for testing the auth routes
function createTestApp() {
  const app = new Hono();
  const { scopedAuth } = createAuthMiddleware(() => db);
  app.route('/auth', authRoutes);
  app.use('/api/*', scopedAuth);
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  return app;
}

// The auth routes import getDb from '../db', so we need to mock it
// Instead, we test at the DB layer + verify the route logic patterns

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'securepassword123';
let testHostId: string;
let testPasswordHash: string;

beforeEach(async () => {
  rawDb = new Database(':memory:');
  db = createBunAdapter(rawDb);
  await configurePragmas(db);
  await runMigrations(db);

  // Create a test host account
  testHostId = crypto.randomUUID();
  testPasswordHash = await Bun.password.hash(TEST_PASSWORD, { algorithm: 'argon2id' });
  await hostsRepo.createHost(db, testHostId, TEST_EMAIL, testPasswordHash, 'Test Host');
});

afterAll(() => {
  rawDb?.close();
});

// ── Host repository ─────────────────────────────────────────────

describe('hostsRepo', () => {
  it('finds host by email', async () => {
    const host = await hostsRepo.findByEmail(db, TEST_EMAIL);
    expect(host).not.toBeNull();
    expect(host!.email).toBe(TEST_EMAIL);
    expect(host!.displayName).toBe('Test Host');
  });

  it('returns null for unknown email', async () => {
    const host = await hostsRepo.findByEmail(db, 'nobody@example.com');
    expect(host).toBeNull();
  });

  it('findByEmailWithHash returns host and password hash together', async () => {
    const result = await hostsRepo.findByEmailWithHash(db, TEST_EMAIL);
    expect(result).not.toBeNull();
    expect(result!.host.email).toBe(TEST_EMAIL);
    expect(result!.passwordHash).toBe(testPasswordHash);
  });

  it('findByEmailWithHash returns null for unknown email', async () => {
    const result = await hostsRepo.findByEmailWithHash(db, 'nobody@example.com');
    expect(result).toBeNull();
  });

  it('verifies correct password with Argon2id', async () => {
    const result = await hostsRepo.findByEmailWithHash(db, TEST_EMAIL);
    const valid = await Bun.password.verify(TEST_PASSWORD, result!.passwordHash);
    expect(valid).toBe(true);
  });

  it('rejects wrong password', async () => {
    const result = await hostsRepo.findByEmailWithHash(db, TEST_EMAIL);
    const valid = await Bun.password.verify('wrongpassword123', result!.passwordHash);
    expect(valid).toBe(false);
  });

  it('rejects duplicate email', async () => {
    expect(
      hostsRepo.createHost(db, crypto.randomUUID(), TEST_EMAIL, 'hash', 'Dup'),
    ).rejects.toThrow();
  });
});

// ── Session lifecycle ───────────────────────────────────────────

describe('sessionsRepo', () => {
  it('creates and validates a session', async () => {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    await sessionsRepo.create(db, tokenHash, testHostId, 'host_admin');

    const session = await sessionsRepo.validate(db, tokenHash);
    expect(session).not.toBeNull();
    expect(session!.hostId).toBe(testHostId);
    expect(session!.type).toBe('host_admin');
  });

  it('returns null for unknown token', async () => {
    const session = await sessionsRepo.validate(db, hashToken('nonexistent-token'));
    expect(session).toBeNull();
  });

  it('revokes a session', async () => {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    await sessionsRepo.create(db, tokenHash, testHostId, 'host_admin');

    // Validate before revoke
    expect(await sessionsRepo.validate(db, tokenHash)).not.toBeNull();

    // Revoke
    await sessionsRepo.revoke(db, tokenHash);

    // Validate after revoke — should be null
    expect(await sessionsRepo.validate(db, tokenHash)).toBeNull();
  });

  it('rejects expired sessions', async () => {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    // Create with expiry in the past
    const pastDate = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').replace('Z', '');
    await sessionsRepo.create(db, tokenHash, testHostId, 'host_admin', {
      expiresAt: pastDate,
    });

    const session = await sessionsRepo.validate(db, tokenHash);
    expect(session).toBeNull();
  });

  it('accepts sessions with no expiry', async () => {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    await sessionsRepo.create(db, tokenHash, testHostId, 'host_admin');

    const session = await sessionsRepo.validate(db, tokenHash);
    expect(session).not.toBeNull();
  });

  it('accepts sessions with future expiry', async () => {
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '');
    await sessionsRepo.create(db, tokenHash, testHostId, 'host_admin', {
      expiresAt: futureDate,
    });

    const session = await sessionsRepo.validate(db, tokenHash);
    expect(session).not.toBeNull();
    expect(session!.hostId).toBe(testHostId);
  });
});

// ── Token utilities ──────────────────────────────────────────────

describe('token utilities', () => {
  it('generateSecureToken produces 64-char hex string', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('generateSecureToken produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken()));
    expect(tokens.size).toBe(100);
  });

  it('hashToken is deterministic', () => {
    const token = 'test-token-123';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('hashToken produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});

// ── Cookie name constant ─────────────────────────────────────────

describe('session cookie', () => {
  it('SESSION_COOKIE is ue_session', () => {
    expect(SESSION_COOKIE).toBe('ue_session');
  });
});
