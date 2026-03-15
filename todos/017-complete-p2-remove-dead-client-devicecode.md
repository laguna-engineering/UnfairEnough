---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, quality, phase3]
dependencies: ["013"]
---

# Client-generated deviceCode is dead code

## Problem Statement
`HostedGameController.ts:173-176` generates a 32-byte deviceCode and sends in REQUEST_AUTH. Server ignores it entirely and generates its own. The `HostMessage` type enforces a payload that's never read.

## Proposed Solutions
Change `REQUEST_AUTH` to have no payload. Remove client-side generation. Update `messages.ts` type.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] `REQUEST_AUTH` has no payload (or empty object)
- [ ] Client does not generate deviceCode
- [ ] Protocol type matches actual usage
