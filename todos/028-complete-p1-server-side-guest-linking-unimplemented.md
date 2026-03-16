---
status: pending
priority: p1
issue_id: "028"
tags: [code-review, architecture, security, phase4]
dependencies: []
---

# Server-side guest linking is completely unimplemented

## Problem Statement
The entire server-side plumbing for Phase 4 guest linking is missing. The mobile client sends `sessionToken` and `invitationToken` in IDENTIFY, but the server ignores both fields. Three interrelated gaps:

1. **IDENTIFY handler ignores tokens** — `room.ts:362-363` only passes `deviceId` to `handleIdentify`, silently dropping `sessionToken` and `invitationToken`. The `handleIdentify` method (line 936) only accepts `deviceId`.

2. **`roomCode=AUTO` has no server handler** — `connectFromSession` (useGameState.ts:152) sends `roomCode=AUTO` for returning users, but the server does `getRoom("AUTO")`, finds nothing, sends `ROOM_NOT_FOUND`, and closes the connection. The returning user flow always fails.

3. **Invitation token generated but never stored** — `auth.ts:189-190` generates an invite token with `// TODO: Phase 4` but this IS Phase 4. The token is sent to the TV but never persisted, so the server can never validate it when a mobile client presents it.

4. **`guestSessionToken` never populated** — `IdentityPayload.guestSessionToken` and `serverUrl` are declared in the protocol but never set in any server response. The `saveGuestSession` call in `onIdentity` (useGameState.ts:65-73) will never execute because `data.guestSessionToken` is always falsy.

## Findings
- Security review: C-1 (invitation token not validated — fake linking possible)
- Architecture review: Finding 2, 2b, 3 (roomCode=AUTO, IDENTIFY ignoring tokens, TODO unresolved)
- TypeScript review: M4 (roomCode=AUTO non-functional), L6 (inviteToken never stored)
- Performance review: P0 (roomCode=AUTO causes connection churn)
- Pattern review: 3e, 3f, 3g (all confirming server-side gaps)

## Proposed Solutions

### Option A: Implement server-side guest session handling (recommended)
1. Store invitation tokens (hashed) per room in-memory or DB
2. Extend `handleIdentify` to accept and validate `invitationToken`, create guest session
3. Populate `guestSessionToken` and `serverUrl` in IDENTITY response
4. Add a session-based room lookup endpoint or handle `roomCode=AUTO` by resolving the room from the session token
- Effort: Large (4-6 hours)
- Risk: Low

### Option B: Remove client-side scaffolding, defer to Phase 4b
1. Remove `connectFromSession`, `checkStoredSession`, `ReturningUserScreen`
2. Remove `authStorage.ts` and the RETURNING phase
3. Keep the protocol extensions but don't use them yet
4. Create a follow-up issue for server implementation
- Effort: Medium (1-2 hours)
- Risk: Delays the feature

## Acceptance Criteria
- [ ] Mobile IDENTIFY with `invitationToken` creates a guest session on the server
- [ ] Server returns `guestSessionToken` and `serverUrl` in IDENTITY response
- [ ] Returning user can reconnect using stored session token
- [ ] Invitation token is validated server-side (not just ignored)
- [ ] `roomCode=AUTO` is handled or replaced with a proper session-to-room resolution
