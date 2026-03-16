---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, security, phase3]
dependencies: ["013"]
---

# serverUrl in AUTH_CHALLENGE derived from Host header — spoofable

## Problem Statement
`index.ts:140` constructs the QR URL from `c.req.header('host')`. A malicious client can set this to `evil.com`, causing the TV to display a phishing QR code.

## Proposed Solutions
Use a `SERVER_BASE_URL` env var (with fallback to `http://localhost:${port}`). Compute once at startup, not per-request.
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] QR verification URL uses a configured base URL, not the Host header
- [ ] Fallback to `http://localhost:${port}` when env var not set
