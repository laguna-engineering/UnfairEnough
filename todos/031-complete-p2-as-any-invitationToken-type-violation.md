---
status: pending
priority: p2
issue_id: "031"
tags: [code-review, quality, phase4]
dependencies: []
---

# `(controller as any).invitationToken` bypasses type system

## Problem Statement
`useGameController.ts:67-68` accesses `invitationToken` through an `as any` cast because `IGameController` doesn't define it. This is fragile — renaming the field on `HostedGameController` would silently break QR URLs with no compiler error.

```typescript
const inviteParam = (controller as any).invitationToken
  ? `&invite=${(controller as any).invitationToken}`
  : '';
```

## Proposed Solutions
Add `invitationToken` to `IGameController`:

```typescript
// IGameController.ts
readonly invitationToken?: string | null;
```

`GameController` (local mode) satisfies via `undefined`. `HostedGameController` already has it as a public field.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] No `as any` casts in useGameController.ts
- [ ] `IGameController` declares `invitationToken`
