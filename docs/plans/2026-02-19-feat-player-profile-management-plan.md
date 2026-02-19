---
title: "feat: Pre-created player profiles with device claiming"
type: feat
date: 2026-02-19
---

# Pre-Created Player Profiles with Device Claiming

## Overview

Allow the game admin to create player profiles (name + avatar) in the admin dashboard before players connect. When a new mobile device joins a game, it sees a list of available profiles to claim instead of entering a name manually. Once claimed, the device auto-selects that profile on future joins. Trust-based, no passwords — designed for family/friends settings.

## Problem Statement

Currently, player profiles are created implicitly when a device first joins a game. There's no way to:
- Pre-create profiles for known players (e.g., kids in a family)
- Let a player pick from existing profiles on a new device
- Transfer a profile identity between devices without losing history

The admin creates kids' profiles once, and each kid claims theirs on first play. From then on, their phone auto-connects as that profile.

## Proposed Solution

Three coordinated changes:

1. **Admin dashboard** — Profile CRUD: create profiles with name + color + emoji, edit, unbind devices, delete
2. **Server / protocol** — Extend `IDENTITY` response with available profiles; extend `JOIN` with profile claiming; add `UNBIND` message
3. **Mobile app** — New `ProfilePickerScreen` for unclaimed devices; modify "Not me" flow to unbind + re-pick

### User Flows

**New device joins (profiles available):**
```
Connect → IDENTIFY → no profile found
→ Server includes availableProfiles in IDENTITY response
→ Mobile shows ProfilePickerScreen (grid of profile cards)
→ Player taps a profile → sends JOIN { profileId, deviceId }
→ Server binds device to profile → WELCOME → lobby
```

**Returning device (auto-select):**
```
Connect → IDENTIFY → profile found
→ WelcomeBackScreen ("Welcome back, Alice!")
→ Auto-join → lobby
```

**"Not me" (re-pick):**
```
WelcomeBackScreen → tap "Not me"
→ Send UNBIND { deviceId } → server nullifies profile's device_id
→ Client generates new deviceId → re-sends IDENTIFY
→ Server returns available profiles (including the just-unbound one)
→ ProfilePickerScreen → pick → JOIN → lobby
```

**No profiles available (fallback):**
```
Connect → IDENTIFY → no profile, no available profiles
→ Existing JoinScreen (enter name manually)
→ JOIN { name, deviceId } → auto-create profile → lobby
```

## Technical Approach

### Phase 1: Database & Schema

**New migration (V4)** in `packages/db/src/migrations.ts`:

```sql
ALTER TABLE players ADD COLUMN avatar_emoji TEXT DEFAULT NULL;
ALTER TABLE players ADD COLUMN source TEXT NOT NULL DEFAULT 'auto';
-- source: 'admin' (pre-created) or 'auto' (created on first join)
```

**Updated types** in `packages/db/src/schema.ts`:
- Add `avatar_emoji: string | null` and `source: 'admin' | 'auto'` to `PlayerRow` / `PlayerProfile`

**New repository functions** in `packages/db/src/repositories/players.ts`:
- `createProfile(db, id, displayName, avatarColor, avatarEmoji)` — creates with `source='admin'`, no `device_id`
- `updateProfile(db, id, { displayName?, avatarColor?, avatarEmoji? })` — admin edits
- `unbindDevice(db, playerId)` — sets `device_id = NULL`
- `claimProfile(db, profileId, deviceId)` — atomic: `UPDATE players SET device_id = ? WHERE id = ? AND device_id IS NULL` (returns boolean success)
- `listAvailableProfiles(db)` — profiles where `source = 'admin' AND device_id IS NULL`
- `deleteProfile(db, id)` — hard delete (cascade removes tag scores)

### Phase 2: WebSocket Protocol

**Extend `IdentityPayload`** in `packages/ws-protocol/src/messages.ts`:

```typescript
interface ProfileSummary {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarEmoji: string;
  totalGames: number;
}

interface IdentityPayload {
  profile: { displayName: string; totalGames: number; totalWins: number } | null;
  availableProfiles?: ProfileSummary[]; // sent when profile is null
}
```

**Extend `JOIN` payload:**

```typescript
{ type: 'JOIN'; payload: { name: string; roomCode?: string; deviceId?: string; profileId?: string } }
```

When `profileId` is provided: server binds `deviceId` to that profile, uses profile's name/color/emoji. Ignores the `name` field.

**New `UNBIND` message:**

```typescript
{ type: 'UNBIND'; payload: { deviceId: string } }
```

Server sets `device_id = NULL` on the matching profile. Responds with updated `IDENTITY`.

**Extend `PlayerInfo`** (broadcast to TV host):

```typescript
interface PlayerInfo {
  playerId: string;
  name: string;
  color: string;
  emoji?: string; // NEW
}
```

### Phase 3: Server Changes

**`apps/server/src/room.ts`:**

- `handleIdentify()` — after looking up profile, if not found, call `listAvailableProfiles()` and include in `IDENTITY` response
- `addPlayer()` — if `profileId` provided in JOIN, call `claimProfile()`. If claim fails (race condition: already claimed), send `ERROR { code: 'PROFILE_ALREADY_CLAIMED' }`. If claim succeeds, load the profile data and use it
- New `handleUnbind()` — calls `unbindDevice()`, then re-runs the identify flow (sends fresh `IDENTITY` with updated available profiles)
- Color assignment: if player has a profile color, use it. Skip that color in round-robin for non-profiled players

**`apps/server/src/routes/players.ts` — new endpoints:**

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/players` | `{ displayName, avatarColor, avatarEmoji }` | Create admin profile |
| `PUT` | `/api/players/:id` | `{ displayName?, avatarColor?, avatarEmoji? }` | Edit profile |
| `PUT` | `/api/players/:id/unbind` | — | Unbind device from profile |
| `DELETE` | `/api/players/:id` | — | Delete profile |

### Phase 4: Admin Dashboard

**`apps/server/admin/index.html`** — add "Create Profile" section:
- Form: name input (max 20 chars) + color picker (12-color palette grid) + emoji picker (~20 emoji grid)
- "Create" button → `POST /api/players`
- Player list: add columns for emoji, bound/unbound status badge

**`apps/server/admin/player.html`** — add profile management:
- Edit form for name, color, emoji
- "Unbind Device" button (shown when device is bound)
- Device ID display (truncated, for debugging)
- "Delete Profile" button with confirmation

### Phase 5: Mobile App

**New `PICK_PROFILE` phase** in `apps/mobile/src/hooks/useGameState.ts`:

```
MobileGamePhase = 'SCAN' | 'IDENTIFYING' | 'WELCOME_BACK' | 'PICK_PROFILE' | 'JOIN' | 'WAITING' | ...
```

Transition logic in identity handler:
- `profile !== null` → `WELCOME_BACK` (existing)
- `profile === null && availableProfiles?.length > 0` → `PICK_PROFILE` (new)
- `profile === null && no available profiles` → `JOIN` (existing)

**New `ProfilePickerScreen.tsx`** in `apps/mobile/src/screens/`:
- 2-column grid of profile cards
- Each card: colored circle with emoji + display name + "X games played"
- Tapping a card sends `JOIN { profileId, deviceId }`
- Bottom: "Play as guest" link → goes to existing JoinScreen
- Handle `PROFILE_ALREADY_CLAIMED` error: re-send IDENTIFY to refresh list

**Modify `WelcomeBackScreen.tsx`:**
- "Not me" button: send `UNBIND { deviceId }` → client clears deviceId → server responds with fresh `IDENTITY` → transition to `PICK_PROFILE` or `JOIN`

**Modify `GameScreen.tsx`:**
- Add case for `PICK_PROFILE` phase routing to `ProfilePickerScreen`

### Shared Constants

**Emoji palette** in `packages/shared/src/index.ts`:

```typescript
export const AVATAR_EMOJIS = [
  '🐱', '🐶', '🦊', '🐼', '🐰', '🦁', '🐸', '🦄',
  '🐙', '🎮', '🌟', '⚡', '🔥', '❄️', '🎯', '🎪',
  '🎨', '🎵', '🍕', '🚀',
] as const;
```

All from Unicode 12.0 or earlier — safe on iOS 14+, Android 10+, modern browsers.

## Race Condition Handling

**Two devices claim same profile simultaneously:**
- `claimProfile()` uses atomic SQL: `UPDATE players SET device_id = ? WHERE id = ? AND device_id IS NULL`
- If `changes === 0` → profile was already claimed → server sends `ERROR { code: 'PROFILE_ALREADY_CLAIMED' }`
- Client re-sends `IDENTIFY` to get refreshed list → shows updated picker

**Profile claimed while picker is open:**
- No real-time push. If the claim fails, client refreshes (see above)
- Acceptable for a family/friends setting with <12 players

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Admin unbinds profile mid-game | In-memory RoomPlayer unaffected. Change takes effect on next connection |
| Profile deleted while device is bound | Next IDENTIFY returns null. Player sees picker or name entry |
| Web incognito (ephemeral deviceId) | Always shows picker or name entry. Acceptable |
| All profiles claimed | Fallback to existing name-entry flow (JoinScreen) |
| "Not me" with no available profiles | After unbind, if only their own profile is now available, show picker with just that one + "Play as guest" |
| Player picks profile already in the room | Server rejects: `ERROR { code: 'PROFILE_IN_USE' }` (a player can't join twice) |

## Files to Modify

| File | Change |
|------|--------|
| `packages/db/src/migrations.ts` | Add V4 migration (avatar_emoji, source columns) |
| `packages/db/src/schema.ts` | Add avatarEmoji, source to types |
| `packages/db/src/repositories/players.ts` | New functions: createProfile, updateProfile, unbindDevice, claimProfile, listAvailableProfiles, deleteProfile |
| `packages/ws-protocol/src/messages.ts` | Extend IdentityPayload, JoinPayload, add UNBIND, add ProfileSummary, extend PlayerInfo |
| `packages/ws-protocol/src/validation.ts` | Validate profileId in JOIN, validate UNBIND message |
| `apps/server/src/room.ts` | Handle profileId in addPlayer, include availableProfiles in handleIdentify, add handleUnbind, profile-aware color assignment |
| `apps/server/src/routes/players.ts` | POST /api/players, PUT /api/players/:id, PUT /api/players/:id/unbind, DELETE /api/players/:id |
| `apps/server/admin/index.html` | Create Profile form, emoji/color pickers, status badges in player list |
| `apps/server/admin/player.html` | Edit profile form, Unbind Device button, Delete Profile button |
| `apps/server/admin/admin.js` | Emoji/color picker helpers, new fetch calls |
| `apps/mobile/src/hooks/useGameState.ts` | Add PICK_PROFILE phase, handle availableProfiles in identity callback, implement unbind flow |
| `apps/mobile/src/screens/GameScreen.tsx` | Route PICK_PROFILE to ProfilePickerScreen |
| `apps/mobile/src/screens/ProfilePickerScreen.tsx` | **NEW**: profile selection grid |
| `apps/mobile/src/screens/WelcomeBackScreen.tsx` | "Not me" sends UNBIND before clearing deviceId |
| `apps/mobile/src/services/WebSocketClient.ts` | Add unbind() method, handle PROFILE_ALREADY_CLAIMED error |
| `packages/shared/src/index.ts` | Export AVATAR_EMOJIS constant |
| `packages/i18n/src/locales/en/translation.json` | New strings: profile picker title, play as guest, profile claimed error |
| `packages/i18n/src/locales/it/translation.json` | Italian translations for above |

## Acceptance Criteria

- [x] Admin can create a profile (name + color + emoji) from the dashboard
- [x] Admin can edit a profile's name, color, and emoji
- [x] Admin can unbind a device from a profile
- [x] Admin can delete a profile
- [x] New device sees profile picker with available (admin-created, unbound) profiles
- [x] Tapping a profile claims it and joins the game with that identity
- [x] Claimed profile auto-selects on future connections (WelcomeBack flow)
- [x] "Not me" unbinds the profile server-side and shows the picker
- [x] Simultaneous claim race condition handled gracefully (error + refresh)
- [x] Fallback to name-entry when no profiles are available
- [x] TV host lobby displays player emoji alongside name and color
- [x] Profile colors are used instead of round-round assignment for profiled players

## Scoping Notes

- **Hosted server only** — local TV mode continues with existing anonymous join flow (no DB access)
- **No authentication** — trust-based, suitable for family/friends
- **No real-time picker updates** — refresh on claim failure is sufficient for <12 player games
- **Auto-created profiles (from name entry) don't appear in picker** — only `source='admin'` profiles are shown
