/**
 * Bumps an app's release stamp and publishes an EAS update with it.
 *
 * The stamp is yy.WW.pp — two-digit year, ISO week number, and a patch counter
 * that restarts at 0 in each new week. Each app keeps its own stamp, so the
 * number on screen only moves when that app actually got a new bundle.
 *
 *   yarn release mobile              # bump mobile, commit, eas update
 *   yarn release tv
 *   yarn release mobile tv           # both, each with its own version
 *   yarn release mobile --set 26.35.0
 *   yarn release tv --dry-run        # print what would happen
 *   yarn release mobile --no-publish # bump + commit only
 *   yarn release mobile -- --branch preview   # extra args go to `eas update`
 *
 * Updates publish for Android only, since that's the only platform in use. Pass
 * your own `-- --platform <ios|all>` if that ever changes.
 *
 * The stamp lives in each app's src/version.ts, i.e. inside the JS bundle, so
 * `eas update` carries it to installed apps. Deliberately NOT the app.config.ts
 * `version` field: both apps use the fingerprint runtime version policy and
 * that field feeds the fingerprint, so bumping it there would make every
 * release incompatible with already-installed builds.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const VERSION_RE = /^(\d{2})\.(\d{2})\.(\d+)$/;
const LINE_RE = /(export const APP_VERSION = ')([^']*)(';)/;

interface App {
  name: string;
  versionFile: string;
  /** Root package.json script that publishes this app's EAS update. */
  updateScript: string;
}

const APPS: Record<string, App> = {
  mobile: {
    name: 'mobile',
    versionFile: resolve(ROOT, 'apps/mobile/src/version.ts'),
    updateScript: 'eas:update:mobile',
  },
  tv: {
    name: 'tv',
    versionFile: resolve(ROOT, 'apps/tv-host/src/version.ts'),
    updateScript: 'eas:update:tv',
  },
};

/** ISO-8601 week number and its week-based year (weeks start Monday). */
function isoYearWeek(date: Date): { year: number; week: number } {
  // Shift to the Thursday of this week: the ISO year is whatever year that
  // Thursday falls in, and week 1 is the week containing January 4th.
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: thursday.getFullYear(), week };
}

function nextVersion(current: string, now: Date): string {
  const { year, week } = isoYearWeek(now);
  const prefix = `${String(year % 100).padStart(2, '0')}.${String(week).padStart(2, '0')}`;
  const match = current.match(VERSION_RE);
  const sameWeek = match && `${match[1]}.${match[2]}` === prefix;
  const patch = sameWeek ? Number(match[3]) + 1 : 0;
  return `${prefix}.${patch}`;
}

function readVersion(app: App): { source: string; current: string } {
  const source = readFileSync(app.versionFile, 'utf-8');
  const match = source.match(LINE_RE);
  if (!match) {
    fail(`Could not find APP_VERSION in ${relative(ROOT, app.versionFile)}`);
  }
  return { source, current: match[2] };
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`\`${command} ${args.join(' ')}\` failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function gitOutput(args: string[]): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf-8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// --- arguments ---------------------------------------------------------------

const argv = process.argv.slice(2);
const passThroughAt = argv.indexOf('--');
const easArgs = passThroughAt === -1 ? [] : argv.slice(passThroughAt + 1);
const args = passThroughAt === -1 ? argv : argv.slice(0, passThroughAt);

// Android is the only platform in use — no iOS or tvOS devices — so updates go
// there unless a pass-through `--platform` says otherwise.
const platformArgs = easArgs.some((arg) => arg.startsWith('--platform'))
  ? []
  : ['--platform', 'android'];

const dryRun = args.includes('--dry-run');
const publish = !args.includes('--no-publish');
const commit = !args.includes('--no-commit');
const setIndex = args.indexOf('--set');
const explicit = setIndex === -1 ? null : args[setIndex + 1];

const targets = args.filter((arg) => !arg.startsWith('--') && arg !== explicit);
const unknown = targets.filter((target) => !(target in APPS));
if (unknown.length > 0) {
  fail(`Unknown target(s): ${unknown.join(', ')} — expected \`mobile\` and/or \`tv\``);
}
if (targets.length === 0) {
  fail('Nothing to release. Usage: yarn release <mobile|tv> [...] [--set yy.WW.pp] [--dry-run]');
}
if (setIndex !== -1 && (!explicit || !VERSION_RE.test(explicit))) {
  fail(`Invalid --set value: ${explicit ?? '(missing)'} — expected yy.WW.pp, e.g. 26.35.0`);
}
if (explicit && targets.length > 1) {
  fail('--set takes a single target, otherwise both apps would get the same version.');
}

const apps = targets.map((target) => APPS[target]);
const now = new Date();

// --- bump --------------------------------------------------------------------

const releases = apps.map((app) => {
  const { source, current } = readVersion(app);
  const next = explicit ?? nextVersion(current, now);
  return { app, source, current, next };
});

for (const { app, current, next } of releases) {
  console.log(`${app.name}: ${current} -> ${next}`);
}

if (dryRun) {
  console.log('');
  console.log('Dry run — would then:');
  if (commit) {
    const paths = releases.map((r) => relative(ROOT, r.app.versionFile)).join(' ');
    console.log(`  git commit ${paths}`);
  }
  if (publish) {
    for (const { app } of releases) {
      console.log(`  yarn ${app.updateScript} ${[...platformArgs, ...easArgs].join(' ')}`.trimEnd());
    }
  }
  process.exit(0);
}

for (const { app, source, next } of releases) {
  writeFileSync(app.versionFile, source.replace(LINE_RE, `$1${next}$3`));
}

// --- commit ------------------------------------------------------------------

// `eas update` publishes the working tree as-is, so anything else uncommitted
// ships too. That's often intended (you just made the change you're releasing),
// but it should never be a surprise.
const versionPaths = releases.map((r) => relative(ROOT, r.app.versionFile));
const otherChanges = gitOutput(['status', '--porcelain'])
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3))
  .filter((path) => !versionPaths.includes(path));

if (commit) {
  const summary = releases.map((r) => `${r.app.name} ${r.next}`).join(', ');
  run('git', ['commit', '-m', `Release ${summary}`, '--', ...versionPaths]);
} else {
  console.log('Skipped commit (--no-commit).');
}

if (otherChanges.length > 0 && publish) {
  console.log('');
  console.log(`Note: ${otherChanges.length} other uncommitted change(s) will ship in this update:`);
  for (const path of otherChanges.slice(0, 10)) console.log(`  ${path}`);
  if (otherChanges.length > 10) console.log(`  … and ${otherChanges.length - 10} more`);
  console.log('');
}

// --- publish -----------------------------------------------------------------

if (!publish) {
  console.log('Skipped publish (--no-publish). Run it yourself with:');
  for (const { app } of releases) {
    console.log(`  yarn ${app.updateScript} ${platformArgs.join(' ')}`.trimEnd());
  }
  process.exit(0);
}

for (const { app, next } of releases) {
  console.log(`Publishing ${app.name} ${next} (${platformArgs[1] ?? 'platform from args'})…`);
  const message = `Release ${app.name} ${next}`;
  run('yarn', [app.updateScript, '--message', message, ...platformArgs, ...easArgs]);
}
