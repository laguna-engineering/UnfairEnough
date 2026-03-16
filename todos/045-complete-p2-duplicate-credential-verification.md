---
status: pending
priority: p2
issue_id: "045"
tags: [code-review, quality, phase5]
dependencies: []
---

# Duplicate credential verification in auth.ts

## Problem Statement
The "find host by email -> get password hash -> verify" pattern is copy-pasted between `POST /auth/login` and `POST /auth/tv-login` (~14 lines each).

## Proposed Solutions
Extract an `authenticateHost(db, email, password)` helper returning `Host | null`.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] Single credential verification function used by both endpoints
