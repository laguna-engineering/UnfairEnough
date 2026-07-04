import { mkdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import type { MediaType } from '@unfairenough/db';

/** Root directory for question media (relative to server CWD apps/server/) */
export const QUESTIONS_DIR = resolve('../../questions');

/**
 * Per-media-type acceptance rules. Adding a new media type is a single entry
 * here — nothing else in the upload flow or the archive format changes.
 *
 * Images are content-validated by magic bytes (reliable). Audio/video are
 * validated by extension + size ceiling — container magic bytes are unreliable
 * and high-maintenance, and this is a trusted single-admin tool (see plan KTD2).
 */
interface MediaRule {
  /** Max file size in bytes. */
  maxSize: number;
  /** Accepted lowercase file extensions (with leading dot). */
  extensions: string[];
  /** Optional magic-byte content check. */
  validateContent?: (bytes: Uint8Array) => boolean;
}

const MB = 1024 * 1024;

/**
 * Whole-archive ceiling for question-set bundle uploads. Single-sourced here so
 * the handler's 413 check (bundleUpload.ts) and Bun's runtime `maxRequestBodySize`
 * (index.ts) can't drift apart — the runtime cap must be ≥ this or the handler's
 * check never runs.
 */
export const MAX_BUNDLE_SIZE = 300 * MB;

const MEDIA_RULES: Record<MediaType, MediaRule> = {
  image: {
    maxSize: 10 * MB,
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    validateContent: isValidImage,
  },
  audio: {
    maxSize: 20 * MB,
    extensions: ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.flac'],
  },
  video: {
    maxSize: 100 * MB,
    extensions: ['.mp4', '.webm', '.mov', '.m4v', '.ogv'],
  },
};

/** Magic byte signatures for accepted image types. */
const IMAGE_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: starts with RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function isValidImage(bytes: Uint8Array): boolean {
  const header = bytes.subarray(0, 12);

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

/**
 * Whether a media url points to a writable local file under `media/` (as opposed
 * to an absolute http(s) url that lives off-server). The media-write loop and the
 * missing-media check must agree on this notion, so it lives in one place.
 */
export function isLocalMediaUrl(url: string): boolean {
  return url.startsWith('media/') && !url.startsWith('http');
}

/**
 * Resolve the media type an extension belongs to, or null if no accepted type
 * claims it. Used by the standalone per-file upload where the type isn't
 * declared by a question.
 */
export function mediaTypeForExtension(path: string): MediaType | null {
  const ext = extname(path).toLowerCase();
  for (const type of Object.keys(MEDIA_RULES) as MediaType[]) {
    if (MEDIA_RULES[type].extensions.includes(ext)) return type;
  }
  return null;
}

/** Validate that targetPath is safe (no traversal, stays within questions dir). */
export function validateTargetPath(targetPath: string): {
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
  if (!resolved.startsWith(`${QUESTIONS_DIR}/`)) {
    return { valid: false, resolved: '', error: 'targetPath resolves outside allowed directory' };
  }

  return { valid: true, resolved };
}

/**
 * Validate a media file's size, extension, and (for images) content against the
 * allow-list for its declared media type.
 */
export function validateMediaFile(params: {
  bytes: Uint8Array;
  size: number;
  targetPath: string;
  mediaType: MediaType;
}): { valid: boolean; error?: string } {
  const { bytes, size, targetPath, mediaType } = params;
  const rule = MEDIA_RULES[mediaType];
  if (!rule) {
    return { valid: false, error: `Unsupported media type: ${mediaType}` };
  }

  if (size > rule.maxSize) {
    return { valid: false, error: `File too large (max ${rule.maxSize / MB}MB for ${mediaType})` };
  }

  const ext = extname(targetPath).toLowerCase();
  if (!rule.extensions.includes(ext)) {
    return {
      valid: false,
      error: `Invalid ${mediaType} extension "${ext}". Accepted: ${rule.extensions.join(', ')}`,
    };
  }

  if (rule.validateContent && !rule.validateContent(bytes)) {
    return { valid: false, error: `File content does not match a valid ${mediaType}` };
  }

  return { valid: true };
}

/** Write a media file to a validated, resolved path, creating parent dirs. */
export async function writeMediaFile(resolvedPath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(resolvedPath), { recursive: true });
  await Bun.write(resolvedPath, bytes);
}

/**
 * Given a set of imported questions, return the unique local `media/` urls whose
 * files are not present on disk. Absolute http(s) urls are ignored. Shared by
 * the YAML-only and bundle upload endpoints.
 */
export async function collectMissingMedia(
  questions: { media: { url: string } | null }[],
): Promise<string[]> {
  const localUrls = questions
    .map((q) => q.media?.url)
    .filter((url): url is string => !!url && isLocalMediaUrl(url));

  const uniqueUrls = [...new Set(localUrls)];

  // Probe all files concurrently — independent stat calls on a hot upload path.
  const results = await Promise.all(
    uniqueUrls.map(async (url) => {
      const check = validateTargetPath(url);
      if (!check.valid) return null; // never probe outside the questions dir
      const exists = await Bun.file(check.resolved).exists();
      return exists ? null : url;
    }),
  );

  return results.filter((url): url is string => url !== null);
}
