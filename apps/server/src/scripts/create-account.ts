#!/usr/bin/env bun
/**
 * CLI tool to create a host account on the UnfairEnough server.
 *
 * Usage:
 *   bun run apps/server/src/scripts/create-account.ts
 *
 * Interactive — prompts for email, password, and display name.
 */

import { hostsRepo } from '@unfairenough/db';
import { initDatabase } from '../db';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  let input = '';
  for await (const line of console) {
    input = line;
    break;
  }
  return input.trim();
}

async function main(): Promise<void> {
  console.log('\n🎮 UnfairEnough — Create Host Account\n');

  const db = await initDatabase();

  // Email
  const email = await prompt('Email: ');
  if (!EMAIL_REGEX.test(email)) {
    console.error('❌ Invalid email format.');
    process.exit(1);
  }

  // Check for duplicate
  const existing = await hostsRepo.findByEmail(db, email);
  if (existing) {
    console.error(`❌ An account with email "${email}" already exists.`);
    process.exit(1);
  }

  // Password
  const password = await prompt('Password (min 12 chars): ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`❌ Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  // Display name
  const displayName = await prompt('Display name: ');
  if (!displayName) {
    console.error('❌ Display name cannot be empty.');
    process.exit(1);
  }

  // Hash password with Argon2id (Bun built-in)
  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });

  // Create account
  const id = crypto.randomUUID();
  const host = await hostsRepo.createHost(db, id, email, passwordHash, displayName);

  console.log(`\n✅ Account created successfully!`);
  console.log(`   Email: ${host.email}`);
  console.log(`   Name:  ${host.displayName}`);
  console.log(`   ID:    ${host.id}`);
  console.log(`\n⚠️  The running server will pick up the new account within 60 seconds.\n`);
}

main().catch((err) => {
  console.error('Failed to create account:', err);
  process.exit(1);
});
