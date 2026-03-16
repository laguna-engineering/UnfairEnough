#!/usr/bin/env bun
/**
 * CLI tool to move existing unscoped data (host_id IS NULL) to a specific host account.
 *
 * Usage:
 *   bun run apps/server/src/scripts/migrate-data.ts --host-email alice@example.com [--confirm]
 *
 * This assigns all rows where host_id IS NULL in tenant-scoped tables
 * to the specified host account. Runs in a single transaction for atomicity.
 */

import { hostsRepo } from '@unfairenough/db';
import { initDatabase } from '../db';

function parseArgs(): { hostEmail: string; confirm: boolean } {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--host-email');
  if (emailIdx === -1 || emailIdx + 1 >= args.length) {
    console.error('Usage: bun run migrate-data -- --host-email <email> [--confirm]');
    process.exit(1);
  }
  return { hostEmail: args[emailIdx + 1], confirm: args.includes('--confirm') };
}

async function main(): Promise<void> {
  const { hostEmail, confirm } = parseArgs();

  console.log('\n🔄 UnfairEnough — Data Migration\n');

  const db = await initDatabase();

  // Look up host
  const host = await hostsRepo.findByEmail(db, hostEmail);
  if (!host) {
    console.error(`❌ No host account found with email "${hostEmail}".`);
    console.error('   Create one first with: bun run create-account');
    process.exit(1);
  }

  console.log(`   Host: ${host.displayName} (${host.email})`);
  console.log(`   ID:   ${host.id}\n`);

  // Tables to migrate
  const tables = ['question_sets', 'players', 'games', 'player_tag_scores', 'events'];

  // Count rows to migrate
  const counts: Record<string, number> = {};
  let totalRows = 0;
  for (const table of tables) {
    const row = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE host_id IS NULL`,
    );
    counts[table] = row?.cnt ?? 0;
    totalRows += counts[table];
  }

  if (totalRows === 0) {
    console.log('   No unscoped data found. Nothing to migrate.\n');
    process.exit(0);
  }

  console.log('   Rows to migrate:');
  for (const table of tables) {
    if (counts[table] > 0) {
      console.log(`     ${table}: ${counts[table]}`);
    }
  }
  console.log(`     Total: ${totalRows}\n`);

  const orphanedQuestions = await db.get<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM questions WHERE set_id IS NULL',
  );
  if (orphanedQuestions && orphanedQuestions.cnt > 0) {
    console.log(
      `   ⚠️  Warning: ${orphanedQuestions.cnt} orphaned questions (no set_id) will remain unscoped.`,
    );
    console.log("   These will appear in every host's casual game pool.\n");
  }

  if (!confirm) {
    console.log('   This is a dry run. Pass --confirm to execute the migration.\n');
    process.exit(0);
  }

  // Migrate in a transaction
  await db.transaction(async () => {
    for (const table of tables) {
      if (counts[table] > 0) {
        await db.run(`UPDATE ${table} SET host_id = ? WHERE host_id IS NULL`, [host.id]);
      }
    }
  });

  console.log(`✅ Migrated ${totalRows} rows to host "${host.displayName}".`);
  console.log('   All data is now scoped to this account.\n');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
