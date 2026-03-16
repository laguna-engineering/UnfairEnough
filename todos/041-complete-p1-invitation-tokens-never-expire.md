---
status: pending
priority: p1
issue_id: "041"
tags: [code-review, security, phase5]
dependencies: []
---

# Invitation tokens never expire and are never cleaned up

## Problem Statement
`invitationTokensRepo.create()` inserts tokens with `expires_at = NULL` (never expires). `removeByRoom()` and `cleanup()` are defined but never called anywhere. Tokens accumulate indefinitely. A leaked QR code grants permanent guest access even after the game room is destroyed.

## Proposed Solutions
1. Set `expires_at` when creating tokens (e.g., 24 hours TTL)
2. Call `removeByRoom(roomCode)` when a room is destroyed in `roomManager.destroyRoom()`
3. Call `cleanup()` periodically (e.g., `setInterval` at server startup, or on each room creation)
- Effort: Small (20 min)

## Acceptance Criteria
- [ ] Invitation tokens have an explicit expiry (e.g., 24h)
- [ ] Tokens are cleaned up when their room is destroyed
- [ ] Expired tokens are periodically purged
