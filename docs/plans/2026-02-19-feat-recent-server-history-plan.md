---
title: "feat: Recent server history with quick-connect"
type: feat
date: 2026-02-19
---

# feat: Recent server history with quick-connect

## Overview

Store the last 5 server IP:port addresses each app connected to, persist them across sessions, show them as a quick-select list, and pre-fill the text input with the most recent address.

## Problem Statement

Every time the mobile or TV host app is launched, users must manually re-enter the server IP:port address. This is tedious, especially during development or when reconnecting to the same server repeatedly.

## Proposed Solution

Add a `recentServers` storage service to each app (mobile + TV host) following the existing `deviceId.ts` platform-aware pattern. Update `ScanScreen` (mobile) and `ConnectScreen` (TV host) to display recent servers and default the input to the last-used address.

### Storage service (per-app)

Create `recentServers.ts` in each app's `services/` directory, mirroring the `deviceId.ts` pattern:

- **Storage key:** `'unfairenough_recent_servers'` — JSON array of `string` (IP:port addresses)
- **Max entries:** 5
- **Platform handling:** `localStorage` on web, `@react-native-async-storage/async-storage` on native
- **In-memory cache:** load once on init, sync reads thereafter
- **On connect:** prepend the new address, deduplicate, cap at 5, persist in background

TV host currently lacks `@react-native-async-storage/async-storage` — add it as a dependency.

### API surface

```typescript
// packages/shared/src/index.ts — add constant
export const MAX_RECENT_SERVERS = 5;
export const RECENT_SERVERS_STORAGE_KEY = 'unfairenough_recent_servers';

// Each app: apps/{mobile,tv-host}/src/services/recentServers.ts
export async function initRecentServers(): Promise<string[]>;
export function getRecentServers(): string[];
export async function addRecentServer(address: string): Promise<void>;
```

### UI changes — Mobile `ScanScreen`

In the IP-entry step (when `showIpInput === true`):

1. **Default value:** Initialize `manualIp` state with `getRecentServers()[0] ?? ''` after `initRecentServers()` completes
2. **Recent list:** Below the IP input, show recent servers as tappable chips (if any exist). Tapping a chip fills the input with that address.
3. **Save on connect:** Call `addRecentServer(address)` in `handleIpConnect` before calling `onConnect`

For the native view (room code entry at the bottom of camera view): when the user taps "Join" and is prompted for an IP, same behavior applies — the IP prompt should show recent servers.

### UI changes — TV host `ConnectScreen`

1. **Default value:** Initialize `serverUrl` state with `getRecentServers()[0] ?? ''` after `initRecentServers()` completes
2. **Recent list:** Below the input, show recent servers as a vertical list of touchable rows. Each row shows the address. Tapping fills the input.
3. **Save on connect:** Call `addRecentServer(host)` in `handleConnect` after successful health check, before calling `onConnected`

### i18n

Add translation keys for both languages (EN + IT):

| Key | EN | IT |
|-----|----|----|
| `scan.recentServers` | `"Recent servers"` | `"Server recenti"` |
| `connect.recentServers` | `"Recent servers"` | `"Server recenti"` |

## Acceptance Criteria

- [ ] Mobile app pre-fills IP input with the most recent server address on launch
- [ ] Mobile app shows up to 5 recent servers as tappable chips below the IP input
- [ ] Tapping a chip fills the IP input with that address
- [ ] Successful connection saves the server address to history
- [ ] TV host app pre-fills server URL input with the most recent address on launch
- [ ] TV host app shows up to 5 recent servers as tappable list items
- [ ] Duplicate addresses are deduplicated (most recent wins)
- [ ] History persists across app restarts (AsyncStorage on native, localStorage on web)
- [ ] Works on all platforms: iOS, Android, web (mobile); tvOS, Android TV, web (TV host)

## Technical Considerations

- **TV host uses `react-native-tvos` fork.** `@react-native-async-storage/async-storage` should work with tvOS — it has tvOS support. Need to verify during implementation.
- **No shared storage package.** Each app gets its own `recentServers.ts` to avoid adding `react-native` as a dependency to `packages/shared/`. The ~40 lines of duplication is acceptable given the platform-specific imports.
- **Shared constants only.** `MAX_RECENT_SERVERS` and `RECENT_SERVERS_STORAGE_KEY` go in `packages/shared/` to keep the magic values centralized.
- **Web TV client (hosted mode):** The web TV build is served by the Bun server — users are already connected when the page loads. No IP entry needed, so no changes required there.

## Files to modify/create

| Action | File |
|--------|------|
| Create | `apps/mobile/src/services/recentServers.ts` |
| Create | `apps/tv-host/src/services/recentServers.ts` |
| Edit | `apps/mobile/src/screens/ScanScreen.tsx` — add recent servers UI + init |
| Edit | `apps/tv-host/src/screens/ConnectScreen.tsx` — add recent servers UI + init |
| Edit | `packages/shared/src/index.ts` — add `MAX_RECENT_SERVERS`, `RECENT_SERVERS_STORAGE_KEY` |
| Edit | `packages/i18n/src/locales/en/translation.json` — add keys |
| Edit | `packages/i18n/src/locales/it/translation.json` — add keys |
| Edit | `apps/tv-host/package.json` — add `@react-native-async-storage/async-storage` |

## References

- Existing storage pattern: `apps/mobile/src/services/deviceId.ts`
- Mobile IP entry: `apps/mobile/src/screens/ScanScreen.tsx:85-89`
- TV host URL entry: `apps/tv-host/src/screens/ConnectScreen.tsx:79-90`
- Shared constants: `packages/shared/src/index.ts`
