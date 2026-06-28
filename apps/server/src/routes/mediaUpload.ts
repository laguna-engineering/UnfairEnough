import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Root directory for question media (relative to server CWD apps/server/) */
const QUESTIONS_DIR = resolve('../../questions');

/** Magic byte signatures for accepted image types */
const IMAGE_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: starts with RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function isValidImage(buffer: ArrayBuffer): boolean {
  const header = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));

  for (const sig of IMAGE_SIGNATURES) {
    if (header.length < sig.bytes.length) continue;
    const matches = sig.bytes.every((b, i) => header[i] === b);
    if (!matches) continue;

    // Extra check for WebP: bytes 8-11 must be "WEBP"
    if (sig.mime === 'image/webp') {
      if (header.length < 12) continue;
      if (header[8] !== 0x57 || header[9] !== 0x45 || header[10] !== 0x42 || header[11] !== 0x50)
        continue;
    }
    return true;
  }
  return false;
}

/** Validate that targetPath is safe (no traversal, stays within questions dir). */
function validateTargetPath(targetPath: string): {
  valid: boolean;
  resolved: string;
  error?: string;
} {
  if (!targetPath || typeof targetPath !== 'string') {
    return { valid: false, resolved: '', error: 'Missing targetPath' };
  }

  // Must start with media/
  if (!targetPath.startsWith('media/')) {
    return { valid: false, resolved: '', error: 'targetPath must start with media/' };
  }

  // No path traversal
  if (targetPath.includes('..') || targetPath.includes('\0')) {
    return { valid: false, resolved: '', error: 'Invalid targetPath' };
  }

  const resolved = resolve(QUESTIONS_DIR, targetPath);

  // Must resolve within the questions directory
  if (!resolved.startsWith(QUESTIONS_DIR + '/')) {
    return { valid: false, resolved: '', error: 'targetPath resolves outside allowed directory' };
  }

  return { valid: true, resolved };
}

const mediaUpload = new Hono<{ Variables: AuthVariables }>();

mediaUpload.post('/upload', async (c) => {
  const contentType = c.req.header('Content-Type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Use multipart/form-data' }, 400);
  }

  const body = await c.req.parseBody();

  const file = body.file;
  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file uploaded. Use field name "file"' }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 413);
  }

  const targetPath = body.targetPath;
  if (!targetPath || typeof targetPath !== 'string') {
    return c.json({ error: 'Missing targetPath field' }, 400);
  }

  const pathCheck = validateTargetPath(targetPath);
  if (!pathCheck.valid) {
    return c.json({ error: pathCheck.error }, 400);
  }

  // Validate file is a real image via magic bytes
  const buffer = await file.arrayBuffer();
  if (!isValidImage(buffer)) {
    return c.json({ error: 'Invalid file type. Accepted: JPEG, PNG, GIF, WebP' }, 415);
  }

  // Auto-create directories
  const dir = dirname(pathCheck.resolved);
  await mkdir(dir, { recursive: true });

  // Write file
  await Bun.write(pathCheck.resolved, buffer);

  return c.json({ path: targetPath, size: file.size });
});

export default mediaUpload;
