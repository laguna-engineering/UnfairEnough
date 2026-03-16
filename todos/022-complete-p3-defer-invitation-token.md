---
status: pending
priority: p3
issue_id: "022"
tags: [code-review, quality, phase3]
dependencies: []
---

# Invitation token generated but never persisted

## Problem Statement
`auth.ts:189-190` generates an invitation token with a TODO for Phase 4. Token is sent to TV but never stored — useless for validation. Creates false sense of security.

## Proposed Solutions
Defer token generation entirely until Phase 4. Send `invitationToken: undefined` in ROOM_CREATED. Remove the `invitationToken` parameter from `createRoomForHost` until needed.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] No invitation token generated or sent until Phase 4 implements DB storage
