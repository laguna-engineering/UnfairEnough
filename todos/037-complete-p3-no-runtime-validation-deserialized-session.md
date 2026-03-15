---
status: pending
priority: p3
issue_id: "037"
tags: [code-review, quality, phase4]
dependencies: []
---

# No runtime validation of deserialized GuestSession from storage

## Problem Statement
`authStorage.ts:26` does `cached = JSON.parse(raw)` and assigns directly to the typed variable without validation. If the stored data is corrupted or from a previous app version with a different schema, the app will crash or behave unpredictably.

Also, `saveGuestSession` (line 36) sets the cache before the async write — if `AsyncStorage.setItem` fails, the in-memory cache diverges from persistent storage.

## Proposed Solutions
1. Add a runtime shape check after JSON.parse (verify expected string fields exist)
2. Return null and clear storage if validation fails
3. Consider adding a `version` field for future migration safety
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Malformed stored sessions are safely handled (return null, clear storage)
