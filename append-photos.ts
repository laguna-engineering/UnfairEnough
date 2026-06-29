/**
 * Idempotent in-place append of question-set YAML into an EXISTING set.
 *
 * Unlike the admin importer (which always creates a brand-new set with new
 * question IDs), this inserts ONLY the questions whose stable `id` (original_id)
 * is not already present in the target set — preserving all existing rows and
 * their play history (round_results, times_asked).
 *
 * Safe to re-run: relies on UNIQUE(original_id, set_id) + INSERT OR IGNORE.
 * Dry-run by default; pass --apply to write. Pass --revive to clear deleted_at.
 *
 * Usage:
 *   bun append-photos.ts <db> <yaml> --set-id <idOrPrefix> [--apply] [--revive]
 */
import { Database } from 'bun:sqlite';
import { parseQuestionSetYaml } from '@unfairenough/db';

const args = Bun.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const dbPath = positional[0];
const yamlPath = positional[1];
const apply = args.includes('--apply');
const revive = args.includes('--revive');
const setSel = (() => {
  const i = args.indexOf('--set-id');
  return i >= 0 ? args[i + 1] : undefined;
})();

if (!dbPath || !yamlPath || !setSel) {
  console.error(
    'Usage: bun append-photos.ts <db> <yaml> --set-id <idOrPrefix> [--apply] [--revive]',
  );
  process.exit(2);
}

// 1) Validate the YAML with the SAME validator the importer uses.
const yamlText = await Bun.file(yamlPath).text();
const parsed = parseQuestionSetYaml(yamlText);
if (!parsed.success) {
  console.error('YAML validation FAILED:');
  for (const e of parsed.errors.slice(0, 20)) console.error('  - ' + e);
  process.exit(1);
}
const input = parsed.data;
const setLanguage = input.language ?? 'en';

// 2) Open DB (writable only when applying) and resolve the target set unambiguously.
const db = new Database(dbPath, apply ? { readwrite: true } : { readonly: true });
db.exec('PRAGMA busy_timeout = 8000');

const matches = db
  .query('SELECT id, name, question_count, deleted_at FROM question_sets WHERE id = ? OR id LIKE ?')
  .all(setSel, setSel + '%') as Array<{
  id: string;
  name: string;
  question_count: number;
  deleted_at: string | null;
}>;
if (matches.length !== 1) {
  console.error(`Expected exactly 1 set matching "${setSel}", found ${matches.length}.`);
  for (const m of matches) console.error(`  ${m.id}  ${m.name}  deleted=${m.deleted_at}`);
  process.exit(1);
}
const set = matches[0];

// 3) Compute the diff by stable original_id.
const existing = new Set(
  (
    db.query('SELECT original_id FROM questions WHERE set_id = ?').all(set.id) as Array<{
      original_id: string | null;
    }>
  )
    .map((r) => r.original_id)
    .filter((x): x is string => !!x),
);
const yamlIds = input.questions.map((q) => q.id).filter((x): x is string => !!x);
const noId = input.questions.filter((q) => !q.id);
const missing = input.questions.filter((q) => q.id && !existing.has(q.id));
const orphans = [...existing].filter((id) => !yamlIds.includes(id));

const rrBefore = (
  db
    .query(
      'SELECT COUNT(*) c FROM round_results rr JOIN questions q ON q.id = rr.question_id WHERE q.set_id = ?',
    )
    .get(set.id) as { c: number }
).c;

console.log('─'.repeat(60));
console.log(`Target set : ${set.id}`);
console.log(`Name       : ${set.name}`);
console.log(
  `Deleted    : ${set.deleted_at ?? '(live)'}${revive && set.deleted_at ? '  → will REVIVE' : ''}`,
);
console.log(`Existing   : ${existing.size} questions, ${rrBefore} round_results (preserved)`);
console.log(`YAML       : ${input.questions.length} questions`);
console.log(
  `To ADD     : ${missing.length}  ${missing.length ? `(${missing[0].id} … ${missing[missing.length - 1].id})` : ''}`,
);
console.log(`Orphans    : ${orphans.length} (in set, not in YAML — left untouched)`);
if (noId.length)
  console.log(`⚠ no-id    : ${noId.length} YAML questions have no id — SKIPPED (cannot dedup)`);
console.log('─'.repeat(60));

if (!apply) {
  console.log('DRY RUN — no changes written. Re-run with --apply to write.');
  process.exit(0);
}

// 4) Backup (clean single-file snapshot incl. WAL) before writing.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${dbPath}.bak-${stamp}`;
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`Backup     : ${backup}`);

// 5) Insert missing rows (exact column mapping from importQuestionSet) + optional revive + count fix.
const insert = db.prepare(
  `INSERT OR IGNORE INTO questions (id, set_id, original_id, type, text, category, tags, time_limit,
     media_type, media_url, media_preview_duration, options, correct_answer, player_difficulty, difficulty, explanation, hide_tags, language)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

let inserted = 0;
const tx = db.transaction(() => {
  for (const q of missing) {
    const res = insert.run(
      crypto.randomUUID(),
      set.id,
      q.id ?? null,
      q.type ?? 'multiple_choice',
      q.text,
      q.category ?? null,
      q.tags ? JSON.stringify(q.tags) : null,
      q.timeLimit ?? null,
      q.media?.type ?? null,
      q.media?.url ?? null,
      q.media?.previewDuration ?? 5,
      JSON.stringify(q.options),
      q.correctAnswer,
      q.playerDifficulty ? JSON.stringify(q.playerDifficulty) : null,
      q.difficulty ?? 3,
      q.explanation ?? null,
      q.hideTags ? 1 : 0,
      q.language ?? setLanguage,
    );
    inserted += res.changes;
  }
  if (revive && set.deleted_at) {
    db.prepare(
      "UPDATE question_sets SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?",
    ).run(set.id);
  }
  const actual = (
    db.query('SELECT COUNT(*) c FROM questions WHERE set_id = ?').get(set.id) as { c: number }
  ).c;
  db.prepare(
    "UPDATE question_sets SET question_count = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(actual, set.id);
});
tx();

const finalCount = (
  db.query('SELECT COUNT(*) c FROM questions WHERE set_id = ?').get(set.id) as { c: number }
).c;
const rrAfter = (
  db
    .query(
      'SELECT COUNT(*) c FROM round_results rr JOIN questions q ON q.id = rr.question_id WHERE q.set_id = ?',
    )
    .get(set.id) as { c: number }
).c;
const liveNow = (
  db.query('SELECT deleted_at FROM question_sets WHERE id = ?').get(set.id) as {
    deleted_at: string | null;
  }
).deleted_at;

console.log('APPLIED.');
console.log(`  inserted        : ${inserted}`);
console.log(`  set count       : ${set.question_count} → ${finalCount}`);
console.log(`  round_results   : ${rrBefore} → ${rrAfter}  (must be unchanged)`);
console.log(`  deleted_at      : ${liveNow ?? '(live)'}`);
