import type { MediaType, QuestionWithMeta } from '@unfairenough/db';
import { unzipSync } from 'fflate';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { getDb } from '../db';
import {
  collectMissingMedia,
  isLocalMediaUrl,
  MAX_BUNDLE_SIZE,
  validateMediaFile,
  validateTargetPath,
  writeMediaFile,
} from '../media/mediaStore';
import { importAndPersistSet } from '../questionSetImport';

const MAX_MB = MAX_BUNDLE_SIZE / 1024 / 1024;

interface SetResult {
  name: string;
  questionCount?: number;
  error?: string;
}

const bundleUpload = new Hono<{ Variables: AuthVariables }>();

// POST /api/question-sets/bundle — upload a zip of YAML question set(s) + media
bundleUpload.post('/', async (c) => {
  const contentType = c.req.header('Content-Type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Use multipart/form-data' }, 400);
  }

  const tooLarge = () => c.json({ error: `Bundle too large. Max ${MAX_MB}MB` }, 413);

  // Reject oversized archives early (authoritative check is file.size below).
  const contentLength = Number(c.req.header('Content-Length') ?? '0');
  if (contentLength > MAX_BUNDLE_SIZE) {
    return tooLarge();
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file uploaded. Use field name "file"' }, 400);
  }
  if (file.size > MAX_BUNDLE_SIZE) {
    return tooLarge();
  }

  // Unzip in memory (accepted for a single-admin tool; see plan Risks).
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    return c.json(
      { error: `Invalid zip archive: ${err instanceof Error ? err.message : String(err)}` },
      400,
    );
  }

  const yamlEntries = Object.keys(entries).filter(
    (name) => (name.endsWith('.yml') || name.endsWith('.yaml')) && !name.startsWith('media/'),
  );
  if (yamlEntries.length === 0) {
    return c.json({ error: 'No question-set YAML (.yml/.yaml) found in bundle' }, 400);
  }

  const db = getDb();
  const hostId = c.get('hostId');

  // Import each YAML independently — one bad set does not roll back the others.
  const sets: SetResult[] = [];
  const importedQuestions: QuestionWithMeta[] = [];

  for (const name of yamlEntries) {
    const yamlText = new TextDecoder().decode(entries[name]);
    let result: Awaited<ReturnType<typeof importAndPersistSet>>;
    try {
      result = await importAndPersistSet(db, yamlText, hostId);
    } catch (err) {
      sets.push({
        name,
        error: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (!result.ok) {
      sets.push({ name, error: `Validation failed: ${result.errors.join('; ')}` });
      continue;
    }

    importedQuestions.push(...result.questions);
    sets.push({ name: result.set.name, questionCount: result.set.questionCount });
  }

  // Request-level 400 only when nothing could be imported.
  if (sets.every((s) => s.error)) {
    return c.json({ error: 'No question sets could be imported', sets }, 400);
  }

  // Write bundled media referenced by imported questions. The media type comes
  // from the question (R2); the path is validated for traversal before writing.
  const referenced = new Map<string, MediaType>();
  for (const q of importedQuestions) {
    if (q.media && isLocalMediaUrl(q.media.url)) {
      referenced.set(q.media.url, q.media.type);
    }
  }

  // Writes are independent — validate synchronously, then fan out the disk I/O.
  await Promise.all(
    [...referenced].map(async ([url, mediaType]) => {
      const pathCheck = validateTargetPath(url);
      if (!pathCheck.valid) return; // traversal/unsafe → skip, reported as missing
      const entry = entries[url];
      if (!entry) return; // not bundled → reported as missing
      const check = validateMediaFile({
        bytes: entry,
        size: entry.byteLength,
        targetPath: url,
        mediaType,
      });
      if (!check.valid) return; // invalid type/size → skip, reported as missing
      await writeMediaFile(pathCheck.resolved, entry);
    }),
  );

  const missingMedia = await collectMissingMedia(importedQuestions);

  return c.json({ sets, missingMedia }, 201);
});

export default bundleUpload;
