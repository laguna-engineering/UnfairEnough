---
status: pending
priority: p1
issue_id: "039"
tags: [code-review, architecture, phase5]
dependencies: []
---

# Broken serverUrl derivation — always produces `http://server`

## Problem Statement
`room.ts:974` derives serverUrl as:
```typescript
payload.serverUrl = `http://${(ws.data as WSData).roomCode ? 'server' : 'unknown'}`;
```
Since `roomCode` is always a truthy string, this always produces `http://server`. The mobile client gets a nonsense URL and cannot reconnect as a returning user.

## Proposed Solutions
Add `serverBaseUrl` to `WSData` in `types.ts`. Populate it during WebSocket upgrade in `index.ts` from `c.req.header('host')` + protocol. Use it in `handleIdentify`:
```typescript
payload.serverUrl = (ws.data as WSData).serverBaseUrl ?? '';
```
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Mobile client receives a real, resolvable server URL in IDENTITY response
- [ ] URL respects the server's actual protocol (http/https)
