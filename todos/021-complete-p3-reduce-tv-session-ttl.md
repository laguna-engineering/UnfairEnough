---
status: pending
priority: p3
issue_id: "021"
tags: [code-review, security, phase3]
dependencies: []
---

# 365-day TV session TTL with no revocation UI

## Problem Statement
TV session tokens live for a full year. No admin UI to view or revoke TV sessions. Combined with unencrypted AsyncStorage, a compromised TV leaks a long-lived credential.

## Proposed Solutions
Reduce TTL to 30-90 days. Add session revocation to admin panel. Consider `expo-secure-store` instead of AsyncStorage for native.
- Effort: Medium (1-2 hours)

## Acceptance Criteria
- [ ] TV session TTL reduced to reasonable duration
- [ ] Admin panel can list and revoke active sessions (future work)
