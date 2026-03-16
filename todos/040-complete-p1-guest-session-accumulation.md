---
status: pending
priority: p1
issue_id: "040"
tags: [code-review, security, phase5]
dependencies: []
---

# Guest session accumulation — no deduplication, DoS risk

## Problem Statement
`room.ts` creates a new guest session every time IDENTIFY is sent with a valid invitationToken. No check for whether the device already has an active session. A malicious client can spam IDENTIFY to create unlimited 90-day sessions, bloating the sessions table.

## Proposed Solutions
Before creating a new guest session, check if an active (non-revoked, non-expired) guest session exists for the same `deviceId` and `hostId`. If so, return the existing session token instead of creating a new one. Revoke old sessions for the same device+host before creating a new one.
- Effort: Small (20 min)

## Acceptance Criteria
- [ ] Same device+host combination reuses or replaces existing guest session
- [ ] Repeated IDENTIFY calls don't create duplicate sessions
