---
title: "feat: Dashboard media upload for question sets"
type: feat
date: 2026-03-19
---

# Dashboard Media Upload for Question Sets

## Overview

When a YAML question set is uploaded through the admin dashboard and it references local media files, detect which files are missing from the server and guide the user through uploading them — with a multi-file picker, per-file status indicators with thumbnails, and a summary of any remaining gaps.

## Problem Statement

Currently, media files referenced in YAML question sets must be manually placed on the server filesystem before (or after) import. There's no feedback when media is missing, and no way to upload images through the dashboard. This means every new question set with images requires SSH access to the server.

## Proposed Solution

Two changes:

1. **Enhanced YAML upload response** — after importing the YAML into the DB, check which `media.url` paths don't have a corresponding file on disk. Return the list of missing paths in the response.
2. **New `POST /api/media/upload` endpoint** — accepts a single image file + target path, validates the file is a real image, writes it to the correct location under `questions/media/`.
3. **Frontend upload modal** — if the YAML response includes missing media, show a modal that lets the user select files, matches them by filename, uploads them with status tracking, and shows a summary on close.

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Upload path security | Client sends full target path from the missing list; server validates it starts with `media/`, has no `..`, resolves within `questions/` | Target paths come from the server's own missing-media list, not user input |
| Filename matching | Match selected files by basename against the missing list | Simple, works for all current question sets where filenames are unique per topic directory |
| Duplicate basenames | If a basename matches multiple missing paths, show a disambiguation dropdown | Rare in practice but handled gracefully |
| Multi-tenant media scoping | No scoping for v1 — media is shared | Matches current behavior; media files are topic-scoped by directory, not host-scoped |
| Multi-file YAML upload | Aggregate missing media across all YAML files, show one modal after all imports complete | Less disruptive than per-file modals |
| Re-open modal later | No for v1 — user can re-upload YAML to retrigger | YAGNI; keeps it simple |
| Auto-create directories | Yes, `mkdir -p` within `questions/media/` | New topic directories are common |
| File overwrite | Overwrite silently | User is explicitly uploading to fill missing slots |
| Accepted types | JPEG, PNG, GIF, WebP (images only for v1) | Covers all current media; audio/video can be added later |
| Max file size | 10 MB per file | Matches existing YAML size limit |
| Upload concurrency | 3 parallel uploads | Balance between speed and server load |
| Progress tracking | Per-file status (pending/uploading/done/failed) not per-file percentage | Simpler; `fetch()` doesn't support upload progress natively |
| Modal behavior | Blocking overlay, closes on Escape or overlay click | Standard modal pattern, first one in the dashboard |
| Failed uploads | Show retry button per file | Essential for reliability |

## Technical Approach

### Phase 1: Server — missing media detection

**File:** `apps/server/src/routes/questionSets.ts`

After the existing `importQuestionSet()` call succeeds, query the just-imported questions for their `media_url` values. For each local path (starts with `media/`, not `http://`/`https://`), check if the file exists on disk at `../../questions/<media_url>` (relative to server CWD). Return the missing ones in the response:

```ts
// questionSets.ts — after successful import
// Response shape change:
{ id, name, questionCount, message, missingMedia: string[] }
```

**File:** `apps/server/src/routes/questionSets.ts` (modify POST handler)

- After `importQuestionSet()`, call `questionsRepo.getBySetId(setId)` to get all questions
- Filter for questions with `media_url` that starts with `media/`
- Check each with `Bun.file(path.resolve(questionsDir, mediaUrl)).exists()`
- Deduplicate and return as `missingMedia`

### Phase 2: Server — media upload endpoint

**New file:** `apps/server/src/routes/mediaUpload.ts`

```
POST /api/media/upload
Content-Type: multipart/form-data
Fields: file (the image), targetPath (e.g. "media/personal-photos/photo-151.jpg")

Response 200: { path: "media/personal-photos/photo-151.jpg", size: 12345 }
Response 400: { error: "Invalid target path" }
Response 413: { error: "File too large (max 10MB)" }
Response 415: { error: "Invalid file type. Accepted: JPEG, PNG, GIF, WebP" }
```

Security:
- `targetPath` must start with `media/`
- Must not contain `..` or null bytes
- `path.resolve()` result must be within the `questions/` directory (prefix check)
- Validate magic bytes (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, GIF: `47 49 46 38`, WebP: `52 49 46 46...57 45 42 50`)
- Max file size: 10 MB
- Auto-create intermediate directories with `mkdir -p`

Register in `apps/server/src/index.ts`:
```ts
app.route('/api/media', mediaUploadRoutes);
```

### Phase 3: Frontend — upload modal

**File:** `apps/server/admin/question-sets.html`

Modify the existing `uploadFiles()` function:
1. After all YAML files are processed, aggregate `missingMedia` arrays from all responses
2. If any missing media, call `showMediaUploadModal(missingMediaList)`

**Modal UI:**
- Semi-transparent overlay + centered white card
- Header: "Upload immagini mancanti" with count (e.g., "12 file necessari")
- Guidance text explaining what to do
- "Seleziona file" button (`<input type="file" multiple accept="image/*">`)
- File list with columns: thumbnail (from `URL.createObjectURL`), filename, matched target path, status icon (pending/uploading/done/failed + retry)
- Upload all matched files on selection, 3 concurrent
- Close button always visible; on close, check remaining missing count
- If still missing: show inline summary banner on the main page listing missing filenames

**File:** `apps/server/admin/style.css`

Add modal styles:
- `.modal-overlay` — fixed, full viewport, semi-transparent black
- `.modal-content` — centered, max-width 700px, white, rounded, shadow
- `.modal-file-list` — scrollable file grid with thumbnails
- `.status-icon` — small colored indicators (gray/blue/green/red)

## Acceptance Criteria

- [x] `POST /api/question-sets` response includes `missingMedia: string[]` listing local media paths not found on disk
- [x] `POST /api/media/upload` accepts an image file + target path, validates content type via magic bytes, validates path is safe, writes to `questions/media/...`, auto-creates directories
- [x] Upload endpoint rejects files > 10 MB (413), non-image files (415), and unsafe paths (400)
- [x] After YAML upload with missing media, a modal appears listing all missing files with thumbnails of selected local files
- [x] User can select multiple files; they are matched by filename to missing paths and uploaded with status indicators
- [ ] Duplicate basename disambiguation shows a dropdown to pick the target path
- [x] Failed uploads show a retry button
- [x] On modal close, a banner shows count of any still-missing files
- [x] Multiple YAML uploads aggregate their missing media into one modal
- [x] Modal closes on Escape key and overlay click

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/server/src/routes/mediaUpload.ts` | **Create** — new upload endpoint |
| `apps/server/src/routes/questionSets.ts` | **Modify** — add missing media detection to POST response |
| `apps/server/src/index.ts` | **Modify** — register new media upload route |
| `apps/server/admin/question-sets.html` | **Modify** — add modal HTML/JS, modify upload handler |
| `apps/server/admin/style.css` | **Modify** — add modal and file list styles |

## References

- Brainstorm: `docs/brainstorms/2026-03-19-dashboard-media-upload-brainstorm.md`
- YAML upload endpoint: `apps/server/src/routes/questionSets.ts:31-89`
- Media static serving: `apps/server/src/index.ts:365`
- Media validation in YAML: `packages/db/src/import/validator.ts:134-149`
- Admin shared utilities: `apps/server/admin/admin.js`
- Questions repo (media columns): `packages/db/src/repositories/questions.ts:100-102`
