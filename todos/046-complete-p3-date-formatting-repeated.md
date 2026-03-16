---
status: pending
priority: p3
issue_id: "046"
tags: [code-review, quality, phase5]
dependencies: []
---

# ISO-to-SQLite date formatting repeated 3 times

## Problem Statement
The same `.toISOString().replace('T', ' ').replace('Z', '')` pattern appears in auth.ts (twice) and room.ts (once).

## Proposed Solutions
Extract `sqliteDateFromNow(days: number): string` helper in `auth/tokens.ts`.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] Date formatting logic exists in a single place
