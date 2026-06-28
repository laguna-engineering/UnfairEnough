---
status: pending
priority: p3
issue_id: "010"
tags: [code-review, security, phase2]
dependencies: []
---

# Secure cookie flag fragile behind reverse proxy

## Problem Statement
`auth.ts:62` uses `c.req.url.startsWith('https')` to set the Secure flag. Behind a reverse proxy (nginx, Cloudflare), `c.req.url` will be `http://` even when the client uses HTTPS.

## Proposed Solutions
Check `X-Forwarded-Proto` header as well:
```typescript
secure: c.req.url.startsWith('https') || c.req.header('X-Forwarded-Proto') === 'https',
```
Or use an env var: `SECURE_COOKIES=true`.
- Effort: Small (5 min)

## Acceptance Criteria
- [ ] Secure cookie flag works correctly behind a reverse proxy
