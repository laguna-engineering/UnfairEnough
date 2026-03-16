---
status: pending
priority: p3
issue_id: "035"
tags: [code-review, quality, phase4]
dependencies: []
---

# Hardcoded '#f87171' instead of colors.error in ReturningUserScreen

## Problem Statement
`ReturningUserScreen.tsx:110` uses hardcoded `'#f87171'` (Tailwind red-400) while all other screens use `colors.error` (`'#FF6B6B'`). Inconsistent theming.

## Proposed Solutions
Replace with `colors.error` from `@unfairenough/ui`.
- Effort: Small (2 min)

## Acceptance Criteria
- [ ] ReturningUserScreen uses theme colors, no hardcoded hex values
