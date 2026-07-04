import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { Hono } from 'hono';
import type { AuthVariables } from '../auth/middleware';
import { initDatabase } from '../db';
import bundleUpload from '../routes/bundleUpload';

const QUESTIONS_DIR = resolve('../../questions');
const TEST_MEDIA_DIR = 'media/__bundle_test__';

// Minimal valid JPEG (magic bytes) so image content validation passes.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00]);

function makeZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) {
    data[k] = typeof v === 'string' ? strToU8(v) : v;
  }
  return zipSync(data);
}

/** Wrap bytes in a File with a plain (non-shared) ArrayBuffer backing. */
function zipFile(bytes: Uint8Array): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], 'bundle.zip', { type: 'application/zip' });
}

function yamlSet(name: string, extraQuestion = ''): string {
  return `name: ${name}
questions:
  - text: Base question?
    options:
      - key: A
        text: One
      - key: B
        text: Two
    correctAnswer: A
${extraQuestion}`;
}

function mediaQuestion(url: string): string {
  return `  - text: Media question?
    media:
      type: image
      url: ${url}
    options:
      - key: A
        text: One
      - key: B
        text: Two
    correctAnswer: A
`;
}

let app: Hono<{ Variables: AuthVariables }>;

async function post(zip: Uint8Array) {
  const form = new FormData();
  form.append('file', zipFile(zip));
  const res = await app.request('/api/question-sets/bundle', { method: 'POST', body: form });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  await initDatabase(':memory:');
  app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', async (c, next) => {
    c.set('hostId', null);
    await next();
  });
  app.route('/api/question-sets/bundle', bundleUpload);
});

afterAll(() => {
  rmSync(resolve(QUESTIONS_DIR, TEST_MEDIA_DIR), { recursive: true, force: true });
  rmSync(resolve(QUESTIONS_DIR, 'secret.txt'), { force: true });
});

describe('POST /api/question-sets/bundle', () => {
  it('rejects a non-zip / corrupt archive with 400', async () => {
    const { res } = await post(strToU8('not a zip'));
    expect(res.status).toBe(400);
  });

  it('rejects a bundle with no YAML with 400', async () => {
    const { res } = await post(makeZip({ 'media/x/a.jpg': JPEG }));
    expect(res.status).toBe(400);
  });

  it('imports a YAML-only set with no missing media', async () => {
    const { res, body } = await post(makeZip({ 'only.yml': yamlSet('YAML Only Set') }));
    expect(res.status).toBe(201);
    expect((body.sets as unknown[]).length).toBe(1);
    expect(body.missingMedia).toEqual([]);
  });

  it('writes present media and reports absent media (AE1)', async () => {
    const present = `${TEST_MEDIA_DIR}/present.jpg`;
    const absent = `${TEST_MEDIA_DIR}/absent.jpg`;
    const yaml = yamlSet('Partial Media Set', mediaQuestion(present) + mediaQuestion(absent));
    const { res, body } = await post(makeZip({ 'set.yml': yaml, [present]: JPEG }));

    expect(res.status).toBe(201);
    expect(body.missingMedia).toEqual([absent]);
    expect(existsSync(resolve(QUESTIONS_DIR, present))).toBe(true);
  });

  it('imports the good set and reports the bad one (multi-YAML)', async () => {
    const good = yamlSet('Good Set');
    const bad = 'name: Bad Set\nquestions: []\n'; // empty questions array → invalid
    const { res, body } = await post(makeZip({ 'good.yml': good, 'bad.yml': bad }));

    expect(res.status).toBe(201);
    const sets = body.sets as { name: string; error?: string }[];
    expect(sets.some((s) => !s.error)).toBe(true);
    expect(sets.some((s) => s.error)).toBe(true);
  });

  it('returns 400 when the only YAML is invalid', async () => {
    const { res } = await post(makeZip({ 'bad.yml': 'name: X\nquestions: []\n' }));
    expect(res.status).toBe(400);
  });

  it('never writes a traversal path outside questions/ (security)', async () => {
    const url = 'media/../secret.txt';
    const yaml = yamlSet('Traversal Set', mediaQuestion(url));
    const { res } = await post(makeZip({ 'set.yml': yaml, [url]: JPEG }));

    // Set still imports; the unsafe path is skipped, nothing written.
    expect(res.status).toBe(201);
    expect(existsSync(resolve(QUESTIONS_DIR, 'secret.txt'))).toBe(false);
  });
});
