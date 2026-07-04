import { describe, expect, it } from 'bun:test';
import { mediaTypeForExtension, validateMediaFile, validateTargetPath } from '../media/mediaStore';

// Minimal valid magic-byte headers.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GARBAGE = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

function bufOfSize(bytes: number): Uint8Array {
  return new Uint8Array(bytes);
}

describe('mediaTypeForExtension', () => {
  it('maps known extensions to their media type', () => {
    expect(mediaTypeForExtension('media/x/a.jpg')).toBe('image');
    expect(mediaTypeForExtension('media/x/a.PNG')).toBe('image');
    expect(mediaTypeForExtension('media/x/a.mp3')).toBe('audio');
    expect(mediaTypeForExtension('media/x/a.mp4')).toBe('video');
  });

  it('returns null for unknown extensions', () => {
    expect(mediaTypeForExtension('media/x/a.txt')).toBeNull();
    expect(mediaTypeForExtension('media/x/noext')).toBeNull();
  });
});

describe('validateTargetPath', () => {
  it('accepts a well-formed media path', () => {
    expect(validateTargetPath('media/actors/foo.jpg').valid).toBe(true);
  });

  it('rejects traversal, null bytes, and non-media prefixes', () => {
    expect(validateTargetPath('media/../../etc/passwd').valid).toBe(false);
    expect(validateTargetPath('media/x/\0.jpg').valid).toBe(false);
    expect(validateTargetPath('questions/x.jpg').valid).toBe(false);
    expect(validateTargetPath('').valid).toBe(false);
  });
});

describe('validateMediaFile', () => {
  it('accepts a valid image by magic bytes', () => {
    const r = validateMediaFile({
      bytes: JPEG,
      size: 6,
      targetPath: 'media/x/a.jpg',
      mediaType: 'image',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects an image whose content fails the magic-byte check', () => {
    const r = validateMediaFile({
      bytes: GARBAGE,
      size: 4,
      targetPath: 'media/x/a.jpg',
      mediaType: 'image',
    });
    expect(r.valid).toBe(false);
  });

  it('accepts audio by extension without content validation', () => {
    const r = validateMediaFile({
      bytes: GARBAGE,
      size: 1000,
      targetPath: 'media/x/a.mp3',
      mediaType: 'audio',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects a file whose extension does not match its declared media type', () => {
    const r = validateMediaFile({
      bytes: GARBAGE,
      size: 1000,
      targetPath: 'media/x/a.txt',
      mediaType: 'audio',
    });
    expect(r.valid).toBe(false);
  });

  it('rejects a video over the per-type size ceiling', () => {
    const r = validateMediaFile({
      bytes: bufOfSize(8),
      size: 101 * 1024 * 1024,
      targetPath: 'media/x/a.mp4',
      mediaType: 'video',
    });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('too large');
  });
});
