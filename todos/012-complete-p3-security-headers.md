---
status: pending
priority: p3
issue_id: "012"
tags: [code-review, security, phase2]
dependencies: []
---

# No security headers on admin pages

## Problem Statement
Admin dashboard HTML pages served as static files with no security headers. Missing: X-Frame-Options (clickjacking), X-Content-Type-Options, Referrer-Policy, CSP.

## Proposed Solutions
Add middleware before admin static file handler:
```typescript
app.use('/admin/*', async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});
```
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Admin pages include X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers
