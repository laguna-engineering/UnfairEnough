---
title: "feat: Admin Dashboard for Player Tag Insights and Question Management"
type: feat
date: 2026-02-19
---

# Admin Dashboard for Player Tag Insights and Question Management

## Overview

Add a lightweight web-based admin dashboard served by the Bun server at `/admin`. The dashboard gives the game master visibility into player tag strengths/weaknesses and provides a UI for uploading YAML question sets — replacing raw API calls with a usable interface. Functional MVP: plain HTML with vanilla JS, no framework, no build step.

## Problem Statement / Motivation

The tag scoring engine, player profiles, and question set upload API are all built and working — but they're invisible. The game master has no way to:

1. **See what tags players are strong/weak at** — the data exists in `player_tag_scores` and is exposed via `GET /api/players/:id/stats`, but there's no UI to browse it.
2. **Upload YAML question files** — `POST /api/question-sets` accepts YAML uploads, but requires `curl` or Postman. A simple upload form would make this accessible.
3. **Browse question sets and tags** — APIs exist (`/api/question-sets`, `/api/tags`) but no visual overview.

The dashboard is a thin UI layer on top of existing APIs. No new backend logic needed.

## Proposed Solution

A set of static HTML pages (or a single-page vanilla JS app) served from `/admin` on the Bun server. Uses `fetch()` to call existing REST APIs. No React, no build step — just HTML/CSS/JS files in `apps/server/admin/`.

### Pages / Sections

#### 1. Players Overview (`/admin` or `/admin/players`)
- Table listing all players (from `GET /api/players`)
- Columns: display name, total games, total wins, total score
- Click a player row → player detail view

#### 2. Player Detail (`/admin/players/:id`)
- Player info header (name, games, wins, score)
- **Tag scores table** — the key feature:
  - Columns: tag, score, correct answers, incorrect answers, games played
  - Sorted by score descending (strongest tags first)
  - Color coding: green for high scores (strong), red for low/negative scores (weak)
- Recent games list (from the same `/api/players/:id/stats` endpoint)

#### 3. Question Sets (`/admin/question-sets`)
- List all question sets (from `GET /api/question-sets`)
- Columns: name, question count, created date
- Click to expand and see questions in a set (from `GET /api/question-sets/:id`)
- **YAML upload form**:
  - File picker (`.yaml`, `.yml`)
  - Upload button → `POST /api/question-sets` with `multipart/form-data`
  - Show success/error result inline
- Delete button per set (calls `DELETE /api/question-sets/:id`)

#### 4. Tags Overview (`/admin/tags`)
- Table of all tags (from `GET /api/tags`)
- Columns: tag name, question count, player count
- Sorted by question count descending

### Navigation

Simple top nav bar with links: **Players** | **Question Sets** | **Tags**

No auth for now (as discussed). The dashboard is open — protect later with the existing `ADMIN_TOKEN` mechanism if needed.

## Technical Approach

### File Structure

```
apps/server/
├── admin/               # New — static admin dashboard files
│   ├── index.html       # Main page, includes nav + players list
│   ├── player.html      # Player detail page (reads ?id= param)
│   ├── question-sets.html  # Question sets list + upload form
│   ├── tags.html        # Tags overview
│   ├── style.css        # Shared minimal styles
│   └── admin.js         # Shared JS utilities (fetch helpers, table rendering)
├── src/
│   └── index.ts         # Add route for /admin/* serving
```

### Server Changes

**`apps/server/src/index.ts`** — Add a static file route for admin pages **before** the catch-all TV host static route:

```typescript
// Serve admin dashboard
app.use('/admin/*', serveStatic({ root: './admin' }));
app.get('/admin', serveStatic({ path: './admin/index.html' }));

// Existing: TV host web build (catch-all, must be last)
app.use('/*', serveStatic({ root: staticDir }));
```

That's the only backend change. Everything else is static files calling existing APIs.

### Frontend Approach

- **Vanilla HTML + JS** — no framework, no build step, no node_modules
- Each page fetches its data from `/api/*` on load using `fetch()`
- Tables rendered with simple DOM manipulation
- Tag score colors: CSS classes based on score thresholds (green > 500, yellow 0-500, red < 0)
- Responsive enough to use on a laptop/tablet — not mobile-optimized
- File upload uses `FormData` API → `POST /api/question-sets`

### Tag Strength/Weakness Visualization

The player detail page is where the game master answers "what is this player strong/weak at":

- **Strong tags**: high score, high correct %, lots of games → shown in green
- **Weak tags**: low/negative score, low correct %, or tags with many incorrect → shown in red
- **Unknown**: tags the player hasn't encountered → not shown (absence = no data)
- Simple bar or score value is sufficient for MVP — no charts library needed

## Acceptance Criteria

- [ ] `/admin` serves the dashboard (doesn't break existing TV host web build at `/`)
- [ ] Players page lists all players from the API
- [ ] Player detail page shows tag scores with color-coded strength/weakness
- [ ] Question sets page lists all sets with question counts
- [ ] Question sets page has working YAML upload form
- [ ] Question sets page has working delete button per set
- [ ] Tags page shows all tags with question/player counts
- [ ] Navigation between pages works
- [ ] Dashboard works in modern browsers (Chrome, Safari, Firefox)

## Context

### Existing APIs (no changes needed)

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/players` | GET | `{ players: PlayerProfile[] }` |
| `/api/players/:id/stats` | GET | `{ player, tagScores, recentGames }` |
| `/api/question-sets` | GET | `{ sets: QuestionSet[] }` |
| `/api/question-sets/:id` | GET | `{ set: { ...set, questions } }` |
| `/api/question-sets` | POST | Upload YAML → `{ id, name, questionCount }` |
| `/api/question-sets/:id` | DELETE | Soft-delete a set |
| `/api/tags` | GET | `{ tags: [{ tag, questionCount, playerCount }] }` |
| `/api/games` | GET | `{ games: Game[] }` |

### References

- Server entry: `apps/server/src/index.ts` — static file serving setup
- Player stats route: `apps/server/src/routes/players.ts:14-67`
- Question sets route: `apps/server/src/routes/questionSets.ts`
- Tags route: `apps/server/src/routes/tags.ts`
- Tag scoring plan: `docs/plans/2026-02-07-feat-tag-based-question-difficulty-personalization-plan.md`
