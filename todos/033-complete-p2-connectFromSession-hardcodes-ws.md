---
status: pending
priority: p2
issue_id: "033"
tags: [code-review, security, phase4]
dependencies: []
---

# connectFromSession hardcodes ws:// — session tokens sent unencrypted

## Problem Statement
`useGameState.ts:149-152` always uses `ws://` regardless of the original protocol:

```typescript
const host = session.serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
const wsUrl = `ws://${host}/ws?role=player&roomCode=AUTO`;
```

If the server was originally `https://`, the session token is now sent over an unencrypted WebSocket. On shared networks, this enables token interception.

Additionally, the `serverUrl` from storage is not validated — a MITM'd initial handshake could set it to an attacker-controlled URL, redirecting all future reconnections.

## Proposed Solutions
1. Respect the stored protocol: `http://` → `ws://`, `https://` → `wss://`
2. Validate `serverUrl` with `new URL()` before storing — reject non-http(s) URLs
3. Use `new URL(serverUrl).host` instead of regex chain for protocol stripping
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] WebSocket protocol matches the server's HTTP protocol
- [ ] Stored serverUrl is validated before persisting
