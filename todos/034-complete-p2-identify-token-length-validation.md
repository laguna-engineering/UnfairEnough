---
status: pending
priority: p2
issue_id: "034"
tags: [code-review, security, phase4]
dependencies: []
---

# No length validation on sessionToken/invitationToken in IDENTIFY

## Problem Statement
`validation.ts:84-85` accepts any string for both tokens with no length limit:

```typescript
const sessionToken = typeof p.sessionToken === 'string' ? p.sessionToken : undefined;
const invitationToken = typeof p.invitationToken === 'string' ? p.invitationToken : undefined;
```

A malicious client can send megabyte-sized strings in these fields, consuming server memory during parsing.

## Proposed Solutions
Add max length validation (256 chars):

```typescript
const sessionToken = typeof p.sessionToken === 'string' && p.sessionToken.length <= 256
  ? p.sessionToken : undefined;
```
- Effort: Small (5 min)

## Acceptance Criteria
- [ ] sessionToken and invitationToken have max length validation
