---
status: pending
priority: p3
issue_id: "025"
tags: [code-review, quality, phase3]
dependencies: []
---

# TV safe zone constants duplicated across 4 screens

## Problem Statement
`TV_SAFE_HORIZONTAL = 96` and `TV_SAFE_VERTICAL = 54` are copy-pasted in AccountLoginScreen, ConnectScreen, ModeSelectionScreen, and LobbyScreen.

## Proposed Solutions
Extract to `@unfairenough/ui` theme as `spacing.tvSafeHorizontal` / `spacing.tvSafeVertical`.
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] TV safe zone values defined once in the UI package
- [ ] All TV screens import from the shared location
