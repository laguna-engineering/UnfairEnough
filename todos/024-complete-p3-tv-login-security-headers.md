---
status: pending
priority: p3
issue_id: "024"
tags: [code-review, security, phase3]
dependencies: ["013"]
---

# tv-login.html missing security headers

## Problem Statement
`GET /auth/tv-login` serves a credential entry form without X-Frame-Options, X-Content-Type-Options, or Referrer-Policy headers. The admin pages have these (from Phase 2 fixes) but the TV login page does not.

## Proposed Solutions
Apply security headers to the `GET /auth/tv-login` response. Or apply globally via middleware for all HTML responses.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] tv-login.html served with X-Frame-Options: DENY and other security headers
