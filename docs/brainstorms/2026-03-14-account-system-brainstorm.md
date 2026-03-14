# Account System for Hosted Server

**Date:** 2026-03-14
**Status:** Brainstorm complete, ready for planning

## What We're Building

An account system that lets hosts authenticate to a private hosted server from the TV app, with mobile players linking to host accounts as guests via QR code scanning. The system maintains full backward compatibility — local mode and unauthenticated hosted mode remain available.

## Why This Approach

The game is moving to a privately hosted server. Authentication is needed to isolate data per host (players, question sets, game history) and to let mobile devices persistently link to a host for seamless reconnection. The design prioritizes TV-friendly UX (no typing on remotes) and one-time setup for mobile players.

## Key Decisions

### TV Host App — 3-Mode Selection Screen

The TV host app's first screen becomes a 3-option chooser (currently 2):

1. **"I have an account"** — Connects to the server URL defined in the `.env` (e.g., `EXPO_PUBLIC_SERVER_URL`). Uses a device-flow login: TV shows a QR code, host scans it with their phone browser, logs in on a web page, TV session is approved.
2. **"Local mode"** — Current behavior. TV runs its own WebSocket server via `react-native-tcp-socket`. No changes.
3. **"I have a local server"** — Current "Hosted" mode. User enters a server URL manually. No authentication. No changes.

### Host Accounts

- **Multiple accounts per server.** Each is a fully isolated tenant — own players, question sets, game history.
- **Credentials:** Email + password. Created via CLI command (`bun run create-account`). No self-registration.
- **Admin panel:** Each host logs in to `/admin/` with their email/password and sees only their own data. No super-admin role.
- **HTTPS required** when accounts are in use. HTTP is fine for unauthenticated "local server" mode.

### TV Login Flow (Device Flow)

1. TV connects to server via WebSocket (`role=host`), no auth yet.
2. Server creates a "pending login" record with a unique code.
3. TV displays QR code: `https://server/auth/tv-login?code=XXXX`.
4. Host scans QR on phone → web page opens → login form (email + password).
5. Host submits credentials → server validates → marks pending login as approved for this host.
6. Server notifies TV via WebSocket: authenticated as host X.
7. TV proceeds to create a game room, shows the game QR code.

### Mobile Guest Linking

- **QR contains a guest invitation token.** When the TV shows the game QR code (in "I have an account" mode), the QR URL includes a short-lived invitation token alongside the room code. Scanning this QR both joins the game AND links the mobile device to the host account.
- **One host at a time.** A mobile device is linked to exactly one host account. Scanning a new host's QR replaces the previous link.
- **One device = one player, strictly enforced.** A device is bound to one player profile under the host. To change player: log out → re-scan QR → pick a different player. Prevents impersonation.
- **Web clients get the same treatment** as native apps — auth token stored in localStorage, same returning-user experience.

### Mobile App Flow

- **Fresh install / not linked:** Shows the scan screen (current behavior). The QR it scans determines everything.
- **Returning user (linked to a host):** Shows server + player info screen with a "Play" button to connect and a "Disconnect from this server" option to unlink and return to the scan screen.
- **Server unreachable:** Shows the server/player info screen with an error message and "Retry" / "Disconnect from this server" options.

### Auth Mechanism — Opaque Tokens + DB Sessions

- All auth tokens are random UUIDs stored in a `sessions` table.
- Host login creates a session row, returns an opaque token.
- TV login uses the device-flow pattern (pending code → approve → upgrade to session).
- Guest invitation tokens are short-lived rows in an `invitations` table.
- Tokens are sent as `Authorization: Bearer {token}` on REST API calls and as a query parameter on WebSocket connections.
- Simple to implement, easy to revoke (delete row), no crypto dependencies.

### Data Isolation

- `players` table gets a `host_id` foreign key. Players are scoped per host.
- `question_sets`, `meta_sets`, `games`, `round_results`, `player_tag_scores` — all scoped per host.
- API endpoints filter by the authenticated host's ID.
- Unauthenticated mode (local server / local mode) continues to work as today — no host scoping.

### Resolved Questions

- **TV session persistence:** Yes, persist in AsyncStorage. TV stays logged in across restarts unless token is revoked.
- **Migration path:** Add a `host_id` column (nullable) to all relevant tables. Create a CLI script to copy/move existing data to a specific host_id. User runs this manually after creating the first account.

## Open Questions

1. **Token expiry:** How long should host session tokens live? Should they auto-refresh or require re-login? Guest tokens?
2. **Password reset:** Since accounts are CLI-created and there's no email sending, how does a host reset a forgotten password? CLI command seems sufficient.
3. **Rate limiting:** Should the server enforce rate limits on login attempts to prevent brute force?

## Out of Scope

- OAuth / social login
- Email-based password reset
- Self-registration for host accounts
- Super-admin role
- End-to-end encryption
- Multi-host linking on mobile (supporting only one host at a time)
