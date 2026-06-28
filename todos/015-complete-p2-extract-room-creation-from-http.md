---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, architecture, phase3]
dependencies: ["013"]
---

# HTTP handler creates rooms — separation of concerns violation

## Problem Statement
`POST /auth/tv-login` (auth.ts) does credential verification + WS push + room creation + invitation token all in one function. HTTP route handlers should not reach into WS connections.

## Proposed Solutions

### Option A: Callback on pending login (recommended)
`createPendingLogin` accepts an `onApproved` callback registered by `index.ts`. HTTP handler calls `approvePendingLogin` which triggers the callback. WS layer handles room creation.
- Effort: Medium (1 hour)

### Option B: Event emitter
Pending login store emits an 'approved' event. WS layer listens.
- Effort: Medium (1 hour)

## Acceptance Criteria
- [ ] `POST /auth/tv-login` only authenticates and approves — does not touch WS or rooms
- [ ] Room creation happens in the WS layer (index.ts or roomManager.ts)
