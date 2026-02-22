---
name: image-safety-checker
description: Analyze quiz question images for child safety. Scan images in questions/media/ (excluding personal-photos/) and flag content unsuitable for children. Tracks analyzed files in a JSON ledger so each image is checked exactly once. Use when the user asks to "check image safety", "audit images", "are the images safe for kids", "scan media for inappropriate content", or wants to verify quiz images are child-appropriate.
---

# Image Safety Checker

Scan all images under `questions/media/` (excluding `personal-photos/`) and assess whether each is safe for children playing the quiz game. Track results in a JSON ledger so re-runs only process new images.

## Tracking File

Path: `questions/media/.image-safety-audit.json`

Format:

```json
{
  "version": 1,
  "lastRunAt": "2026-02-22T14:30:00Z",
  "files": {
    "actors/tom-hanks.jpg": {
      "safe": true,
      "concerns": null,
      "analyzedAt": "2026-02-22T14:30:00Z"
    },
    "memes/some-meme.jpg": {
      "safe": false,
      "concerns": "Contains violent imagery",
      "analyzedAt": "2026-02-22T14:30:00Z"
    }
  }
}
```

Keys under `files` are paths relative to `questions/media/`. If the file is deleted, re-running the skill starts fresh for all images.

## Workflow

### 1. Load the ledger

Read `questions/media/.image-safety-audit.json`. If it doesn't exist, start with `{"version":1,"files":{}}`.

### 2. Discover images

Glob for `questions/media/**/*.{jpg,jpeg,png,gif,webp}` — exclude any path containing `personal-photos/`.

### 3. Filter to unanalyzed

Remove files already present in the ledger's `files` object. If none remain, report "All images already analyzed" with a summary of previous results and stop.

### 4. Analyze in batches

Process images in parallel batches of **10**. For each image, use the **Read tool** to view it and assess against these criteria:

- **Violence / gore** — blood, weapons aimed at people, graphic injury
- **Sexual content / nudity** — explicit or suggestive imagery
- **Drugs / alcohol** — glamorization or explicit depiction of substance use
- **Hate symbols** — extremist imagery, slurs, discriminatory symbols
- **Scary / disturbing** — horror imagery that could frighten young children
- **Profanity** — offensive text visible in the image

Mark as `"safe": true` when none of the above apply. Mark as `"safe": false` with a brief `concerns` description otherwise. When in doubt, flag it — false positives are cheap, false negatives are not.

### 5. Update the ledger

After each batch, write the updated ledger to `questions/media/.image-safety-audit.json` (so progress is saved even if the session is interrupted).

### 6. Report

Print a summary:

```
Image Safety Audit Complete
───────────────────────────
Total images:    179
Already audited: 120
Newly analyzed:  59
  ✓ Safe:        57
  ✗ Flagged:     2

Flagged images:
  - memes/some-meme.jpg: Contains violent imagery
  - actors/example.jpg: Suggestive content
```

If any images are flagged, list them with their concerns so the user can review and decide what to do.
