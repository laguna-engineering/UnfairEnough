---
status: pending
priority: p2
issue_id: "043"
tags: [code-review, quality, phase5]
dependencies: []
---

# Migration script runs without confirmation prompt

## Problem Statement
`migrate-data.ts` performs bulk UPDATEs on production data without asking for confirmation. Running with the wrong `--host-email` irreversibly assigns data to the wrong host.

## Proposed Solutions
Add a `--confirm` flag that must be explicitly passed. Without it, show "Dry run — pass --confirm to execute" and skip the transaction.
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Script requires `--confirm` flag for actual data modification
- [ ] Without `--confirm`, shows what would be migrated (dry run)
