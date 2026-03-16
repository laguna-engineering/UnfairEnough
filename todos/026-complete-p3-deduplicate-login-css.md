---
status: pending
priority: p3
issue_id: "026"
tags: [code-review, quality, phase3]
dependencies: []
---

# ~35 lines of CSS duplicated between login.html and tv-login.html

## Problem Statement
Both pages share nearly identical CSS for `.login-card`, body, label, input, button, `.login-error`. Both already import `/admin/style.css`.

## Proposed Solutions
Move shared login form styles into `style.css`. Keep only page-specific styles (`.code-display`, `.success-msg`) inline.
- Effort: Small (15 min)

## Acceptance Criteria
- [ ] Shared login CSS in style.css
- [ ] No duplicated style blocks across HTML files
