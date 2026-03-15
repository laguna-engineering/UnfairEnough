---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, quality, phase3]
dependencies: ["013"]
---

# Duplicated generateUserCode + dead exports in pendingLogins

## Problem Statement
`generateUserCode` exists in both `tokens.ts` and `pendingLogins.ts` (identical). `findByUserCode` has a normalization bug (strips dashes but map keys include them). Both `findByUserCode` and `findByDeviceCode` are exported but never called.

## Proposed Solutions
- Delete private `generateUserCode` from pendingLogins.ts, import from tokens.ts
- Remove unused `findByUserCode` and `findByDeviceCode` exports
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] Single `generateUserCode` implementation in tokens.ts
- [ ] No dead exports from pendingLogins.ts
