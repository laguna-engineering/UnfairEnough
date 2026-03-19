# Dashboard Media Upload

**Date:** 2026-03-19
**Status:** Ready for planning

## What We're Building

When a YAML question set is uploaded through the admin dashboard and it references local media files (e.g. `media/personal-photos/photo-151.jpg`), the dashboard should detect missing images and guide the user through uploading them.

### User Flow

1. User uploads YAML file(s) via the existing question set upload form
2. Server imports the YAML into the DB and returns a list of media URLs that don't yet exist on disk
3. If missing media is detected, a modal appears listing the needed files with guidance
4. User selects files (multi-file picker) — matched to YAML references **by filename**
5. Files upload individually to a new `POST /api/media/upload` endpoint with progress bar and thumbnail previews
6. When all uploads finish (or user closes the modal), a summary shows any images still missing

### Backend

- New endpoint: `POST /api/media/upload` — accepts a single file + target path, validates content type (magic bytes / MIME), writes to `questions/media/...`
- Enhanced `POST /api/question-sets` response — after import, check which `media.url` references have no corresponding file on disk, return `missingMedia: string[]`

### Frontend (admin dashboard)

- After YAML upload success, check `missingMedia` in response
- If non-empty, show upload modal with:
  - List of needed filenames
  - Multi-file picker (`<input type="file" multiple>`)
  - Filename matching: selected files matched against needed filenames
  - Per-file progress bars + image thumbnail previews as they upload
  - Unmatched files flagged with a warning
- On modal close, show summary toast/banner of any still-missing images

## Why This Approach

- **Separate endpoint (Approach B):** More flexible than bundling everything in one request. Supports retrying individual failed uploads, and could be reused later for uploading images to existing sets.
- **Filename matching:** Simple and sufficient — YAML references like `media/topic/photo-151.jpg` are matched by the `photo-151.jpg` part. No need for complex folder structure matching.
- **Server-side content validation:** Prevents accidental upload of HTML redirect pages, corrupt files, or non-image files that would break in-game display.
- **Immediate prompt after YAML:** Single continuous flow — user doesn't have to remember to come back and upload images later.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Upload timing | Immediately after YAML upload | Single continuous flow, less friction |
| File matching | By filename | Simple, works for flat file selections |
| Upload strategy | Separate endpoint, one file at a time | Supports per-file retry, reusable endpoint |
| Validation | Server-side content type check | Prevents broken images in-game |

## Open Questions

- Should there be a max file size per image? (Currently question sets are capped at 10MB)
- Should we support drag-and-drop in addition to the file picker?
