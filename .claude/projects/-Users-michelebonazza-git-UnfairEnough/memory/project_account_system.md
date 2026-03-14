---
name: Account system feature
description: Adding multi-tenant host accounts with device-flow TV login, guest linking via QR, and per-host data isolation
type: project
---

Building an account system for the hosted server. Brainstorm completed 2026-03-14.

**Why:** User is hosting the server privately and needs authentication + data isolation per host.

**Key decisions:**
- TV host app gets 3 modes: "I have an account" / "Local mode" / "I have a local server"
- Host accounts: email+password, created via CLI, multiple per server
- TV login: device-flow (TV shows QR → host scans with phone → logs in on web page → TV approved)
- Mobile guest linking: QR contains invitation token → device linked to host account → one host at a time, one player per device
- Auth: opaque UUID tokens in DB sessions table (no JWT)
- Data isolation: all tables get host_id FK, API filters by authenticated host
- HTTPS required for account mode, HTTP fine for local server mode
- Migration: CLI script to copy/move existing data to a host_id
- TV persists auth in AsyncStorage across restarts
- Admin panel: each host logs in and sees only their own data

**How to apply:** Reference brainstorm at docs/brainstorms/2026-03-14-account-system-brainstorm.md for full details.
