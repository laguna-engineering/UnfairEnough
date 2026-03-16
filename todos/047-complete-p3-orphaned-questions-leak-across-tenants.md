---
status: pending
priority: p3
issue_id: "047"
tags: [code-review, data-integrity, phase5]
dependencies: []
---

# Orphaned questions (no set_id) leak across tenant boundaries

## Problem Statement
Questions with `set_id IS NULL` appear in every host's casual game pool via the query `set_id IS NULL OR set_id IN (...)`. After migration, these orphaned questions are shared across all tenants.

## Proposed Solutions
Migration script should report orphaned questions count and warn the operator. Optionally add a `--assign-orphaned-questions` flag.
- Effort: Small (10 min)

## Acceptance Criteria
- [ ] Migration script reports orphaned question count
