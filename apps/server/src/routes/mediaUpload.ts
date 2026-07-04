import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import {
  mediaTypeForExtension,
  validateMediaFile,
  validateTargetPath,
  writeMediaFile,
} from '../media/mediaStore';

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

  const targetPath = body.targetPath;
  if (!targetPath || typeof targetPath !== 'string') {
    return c.json({ error: 'Missing targetPath field' }, 400);
  }

  const pathCheck = validateTargetPath(targetPath);
  if (!pathCheck.valid) {
    return c.json({ error: pathCheck.error }, 400);
  }

  // Resolve the media type from the file extension (no question declares it here)
  const mediaType = mediaTypeForExtension(targetPath);
  if (!mediaType) {
    return c.json({ error: 'Unrecognized media file type' }, 415);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateMediaFile({ bytes, size: file.size, targetPath, mediaType });
  if (!check.valid) {
    const status = check.error?.includes('too large') ? 413 : 415;
    return c.json({ error: check.error }, status);
  }

  await writeMediaFile(pathCheck.resolved, bytes);

  return c.json({ path: targetPath, size: file.size });
});

export default mediaUpload;
