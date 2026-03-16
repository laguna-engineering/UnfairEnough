---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, quality, phase3]
dependencies: ["013"]
---

# Credential verification duplicated between login and tv-login

## Problem Statement
`POST /auth/login` and `POST /auth/tv-login` have identical 3-step credential verification (findByEmail + getPasswordHash + verify). Also both do 2 DB queries when 1 suffices.

## Proposed Solutions
Extract `verifyCredentials(db, email, password): Promise<Host | null>` using `findByEmailWithHash` (from Phase 2 fix). Both handlers call the helper.
- Effort: Small (20 min)

## Acceptance Criteria
- [ ] Single `verifyCredentials` helper shared by both endpoints
- [ ] Uses single DB query (findByEmailWithHash)
- [ ] Returns Host on success, null on failure
