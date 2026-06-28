---
status: done
priority: p1
issue_id: "030"
tags: [code-review, architecture, phase4]
dependencies: ["028"]
---

# TV auto-reconnect creates anonymous room — host identity lost

## Problem Statement
`App.tsx:117-130` auto-connects from stored auth but creates a `HostedGameController` with only `onRoomCreated` — no auth callbacks. Since `authMode = !!callbacks?.onAuthChallenge` (HostedGameController line 78), this means `authMode = false`, so:

1. No `REQUEST_AUTH` is sent on connect
2. Server treats it as a legacy host, creating a room with `hostId = null`
3. The stored `auth.sessionToken` is loaded but never sent to the server
4. Player profiles, host-specific question sets, and invitation tokens don't work

This defeats the purpose of the account system — after app restart, the TV silently downgrades to anonymous mode.

## Proposed Solutions

### Option A: Pass session token in WS URL (quick fix)
Add `?token=XXX` to the WebSocket URL. Server validates the token and creates an authenticated room.
- Effort: Small (30 min)

### Option B: Full auth flow with session token (recommended)
Use `authMode = true` but send `REQUEST_AUTH` with the stored session token instead of triggering the QR flow. Server validates session and creates room directly.
- Effort: Medium (1 hour)

## Acceptance Criteria
- [x] TV auto-reconnect creates a room associated with the host account (hostId set)
- [x] Expired stored sessions fall back to the login screen
- [x] Player profiles and question sets load correctly after auto-reconnect

## Resolution (Option A implemented)
Session token is passed as `?token=XXX` query parameter on the WebSocket URL. Server validates it
asynchronously on connect and creates an authenticated room with the correct `hostId`. If the token
is invalid or expired, the server sends `SESSION_INVALID` error and closes the connection; the TV
app clears stored auth and falls back to `mode_select`.
