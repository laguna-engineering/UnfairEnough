---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, security, phase3]
dependencies: ["013"]
---

# No limits on pending logins or awaiting hosts — DoS vector

## Problem Statement
`awaitingAuthHosts` Set (index.ts:60) has no timeout for idle hosts. `pendingByDeviceCode` has no size limit. Attacker can open many WS connections, each creating a pending login with a setTimeout, exhausting memory.

## Proposed Solutions
- Add idle timeout (30s) for awaiting hosts — close WS if no message received
- Cap pending logins (e.g., `MAX_PENDING_LOGINS = 100`)
- Remove `awaitingAuthHosts` Set entirely (never queried, `!data.roomCode` check suffices)
- Effort: Small (20 min)

## Acceptance Criteria
- [ ] Host WS connections that don't send a message within 30s are closed
- [ ] `createPendingLogin` rejects when at capacity
- [ ] `awaitingAuthHosts` removed or replaced with timeout mechanism
