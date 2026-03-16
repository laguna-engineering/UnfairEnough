---
status: pending
priority: p2
issue_id: "044"
tags: [code-review, architecture, phase5]
dependencies: []
---

# Room force-close doesn't notify connected clients

## Problem Statement
`auth.ts` calls `destroyRoom()` for one-TV-per-host enforcement, but `room.cleanup()` clears data structures without notifying connected WebSocket clients. The old TV and any players are left with dangling connections.

## Proposed Solutions
Add a `ROOM_CLOSED` message sent to all connected sockets before cleanup:
```typescript
// In room.cleanup() or a new forceClose():
this.broadcastToAll({ type: 'ERROR', payload: { code: 'ROOM_CLOSED', message: 'Room closed' } });
// Then close all sockets
```
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Connected clients receive notification when room is force-closed
- [ ] Old TV session can detect the closure and re-authenticate
