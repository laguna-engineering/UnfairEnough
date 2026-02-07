#!/usr/bin/env node
/**
 * Lint Changed Files Script
 *
 * Claude Code stop hook that lints only files modified since the last commit.
 * Uses a mtime cache to avoid re-linting files that haven't changed since
 * the last successful lint. Runs Biome with --fix to auto-correct what it can.
 *
 * Exit codes:
 *   0 — all good (or nothing to lint)
 *   2 — lint errors remain after auto-fix (Claude should react)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFolder = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptFolder);

const CACHE_FILE = join(projectRoot, '.claude', '.lint-cache.json');
const LINTABLE_EXTENSIONS = ['.js', '.mjs', '.ts', '.tsx', '.json'];

// Must match the "includes" patterns in biome.json
const BIOME_INCLUDES = [
  /^apps\/server\/src\//,
  /^apps\/tv-host\/src\//,
  /^apps\/tv-host\/[^/]+\.tsx?$/,
  /^apps\/mobile\/src\//,
  /^apps\/mobile\/[^/]+\.tsx?$/,
  /^packages\/[^/]+\/src\//,
  /^e2e\//,
  /^[^/]+\.ts$/,
  /^[^/]+\.json$/,
];

function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {
    console.error('Warning: Could not load lint cache, starting fresh');
  }
  return {};
}

function saveCache(cache) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.error(
      'Warning: Could not save lint cache:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function getChangedFiles() {
  try {
    const diffResult = execSync(
      'git diff --name-only --diff-filter=d HEAD 2>/dev/null || git diff --name-only --diff-filter=d',
      { cwd: projectRoot, encoding: 'utf-8' },
    ).trim();

    const stagedResult = execSync('git diff --name-only --cached --diff-filter=d', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();

    const untrackedResult = execSync('git ls-files --others --exclude-standard', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();

    const allFiles = new Set();
    if (diffResult) diffResult.split('\n').forEach((f) => f && allFiles.add(f));
    if (stagedResult) stagedResult.split('\n').forEach((f) => f && allFiles.add(f));
    if (untrackedResult) untrackedResult.split('\n').forEach((f) => f && allFiles.add(f));

    return Array.from(allFiles);
  } catch (error) {
    console.error(
      'Error getting changed files:',
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

function filterLintableFiles(files) {
  return files.filter((file) => {
    if (!LINTABLE_EXTENSIONS.some((ext) => file.endsWith(ext))) return false;
    if (
      file.includes('node_modules/') ||
      file.includes('/dist/') ||
      file.includes('/.expo/') ||
      file.includes('/ios/') ||
      file.includes('/android/') ||
      file.includes('nodejs-assets/')
    )
      return false;

    // Must match at least one of Biome's include patterns
    if (!BIOME_INCLUDES.some((re) => re.test(file))) return false;

    return existsSync(resolve(projectRoot, file));
  });
}

function getFilesNeedingLint(files, cache) {
  return files.filter((file) => {
    try {
      const stats = statSync(resolve(projectRoot, file));
      return stats.mtimeMs > (cache[file] || 0);
    } catch {
      return true;
    }
  });
}

function runLint(files) {
  if (files.length === 0) return true;

  console.log(`Linting ${files.length} changed file(s)...`);

  const result = spawnSync('npx', ['@biomejs/biome', 'check', '--fix', ...files], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  return result.status === 0;
}

function main() {
  const startTime = Date.now();
  const cache = loadCache();

  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    return;
  }

  const lintableFiles = filterLintableFiles(changedFiles);
  if (lintableFiles.length === 0) {
    return;
  }

  const filesToLint = getFilesNeedingLint(lintableFiles, cache);
  if (filesToLint.length === 0) {
    return;
  }

  const lintSuccess = runLint(filesToLint);

  const now = Date.now();
  for (const file of filesToLint) {
    cache[file] = now;
  }
  saveCache(cache);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (lintSuccess) {
    console.log(`Lint passed (${elapsed}s)`);
  } else {
    console.log(`Lint found issues (${elapsed}s)`);
    process.exit(2);
  }
}

main();
