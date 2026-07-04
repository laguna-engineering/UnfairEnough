---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
date: 2026-07-04
---

# Audio Question Playback - Plan

## Goal Capsule

- **Objective**: Let questions carry audio that plays on the host/TV — either as the subject of the question ("what song/movie/game is this?", optionally with an image) or as background music during the question — and preload media a question ahead so playback never stalls.
- **Product authority**: The Product Contract below (from `/ce-brainstorm`, confirmed 2026-07-04). This document is now enriched to implementation-ready.
- **Open blockers**: None. Data model, media upload, and the two-phase preview flow already exist; this is a playback + preloading feature.
- **Product Contract preservation**: Product Contract unchanged — planning added the Planning Contract, Implementation Units, and Verification Contract without altering product scope.

---

## Product Contract

### Problem & outcome
Questions today can only *show* an image; the schema already stores `audio`/`video` but the game can't play them. We want audio-driven questions — name-that-tune style and ambient background music — that sound in the room, in sync, with no download stalls between questions.

### Primary actor
The players in the room (hear audio via the shared host/TV) and the question author (declares audio behavior in YAML).

### In scope
- **Host-only audio playback** in two slots:
  - **Listen slot** — audio plays during the existing `MEDIA_PREVIEW` phase, optionally alongside an image; options appear when the clip finishes ("listen first, then answer").
  - **Answer slot** — audio plays during the `QUESTION` phase. Covers both "answer while it plays" (subject audio) and plain background music.
- **A question may carry both an image and audio** together. Image stays TV-only, as today.
- **Per-question authored behavior**: listen-first vs answer-while-playing; and background music on any question type.
- **Host-side preloading / one-question lookahead**: the host fetches the next question's media during the current question. On a preload miss, **hold and advance only when the media is in hand** — never start a question whose media isn't ready.
- **Amplified speed scoring for answer-while-playing questions**: the existing time bonus is weighted up for this mode. Composes with the existing catch-up and lifetime-handicap multipliers.
- **Ambient app music handling**: pause the TV's existing bundled background music while any question audio plays; resume afterward, honoring the current mute toggle.
- **YAML authoring** for the above.

### Out of scope
- Audio on players' phones — phones keep showing "look at TV." No per-player playback or cross-device sync.
- Ducking/crossfade/volume mixing beyond pause-then-resume of the app music.
- Replacing or restyling the existing bundled app-music system.
- New media-upload/storage work — audio upload already landed (20 MB cap; common audio formats).
- Video playback (schema allows it; not part of this feature).

### Success criteria
- A listen-first audio question plays its clip on the TV for the authored duration, shows an accompanying image if present, then reveals options — with the answer timer starting after the clip.
- An answer-while-playing question shows options as the clip starts, and answering earlier yields a visibly larger score than in a normal question.
- Background music plays on the TV during a question and stops cleanly at reveal.
- Across a full game with media on consecutive (deterministic) questions, players never wait on a download between questions.
- The app's ambient music pauses during question audio and resumes after, without double-playing.

---

## Planning Contract

### Architecture note — two orchestrators (read first)
The game loop exists **twice** and both must be edited in lockstep for every game-logic change:
- `apps/server/src/room.ts` (`GameRoom`) — hosted mode; TV is a WS display client.
- `apps/tv-host/src/services/GameController.ts` — local mode; TV runs the engine in-process and broadcasts to phones via an embedded WS server.

They are near line-for-line mirrors (`showNextQuestion`, `sendQuestion`, `onMediaLoaded`/`notifyMediaLoaded`, `startPreviewCountdown`, `endQuestion`, `showRoundResults`). Any unit below marked **[both orchestrators]** requires a parallel edit in each, kept behaviorally identical.

### Key Technical Decisions

- **KTD1 — Separate `audio:` block, not an overloaded `media`.** Authors add an optional `audio` object beside the existing `media` (image). Two orthogonal fields drive behavior: `play: preview | question` (default `question`) and `role: subject | background` (default `background`), plus optional `duration`. Combos: `subject`+`preview` = listen-first; `subject`+`question` = answer-while-playing (scored, amplified); `background`+`question` = background music. `play: preview` requires `role: subject` (a preview clip is always the subject). *Rationale*: backward-compatible (the single `media_url` column stays the image), keeps the "is this scored?" signal explicit, and avoids a media-array rewrite. Defaults make "just add music" a one-liner.
- **KTD2 — Preload via new `MEDIA_PRELOAD`/`MEDIA_PRELOADED` messages** mirroring `MEDIA_PREVIEW`/`MEDIA_LOADED`, with a `questionId` correlation guard (the established stale-message pattern). TV↔server only (not in the mobile `ClientMessage` union).
- **KTD3 — Preload scoped to deterministic question order.** The authored/casual/configured path indexes `this.questions[idx]`, so `this.questions[idx+1]` is a valid peek. The adaptive/meta pool selects the next question at advance-time and **cannot** be peeked — those games skip preload and rely on the existing at-preview `MEDIA_LOADED` handshake as the backstop.
- **KTD4 — "Hold until ready" is realized between questions, not at question start.** The server gates the results→next-question advance on the host's `MEDIA_PRELOADED` ack (with a timeout backstop), so the hold is hidden inside the results screen. The existing `MEDIA_LOADED` preview handshake remains a secondary backstop for preview-slot media.
- **KTD5 — Amplified speed bonus via a new `calculateScore` argument.** Add an optional `speedBonusMultiplier` (default `1`) applied to the `timeBonus` term; the call sites pass `SUBJECT_SPEED_BONUS_MULTIPLIER` (≈`1.5`, tunable) when the active question is `role: subject` + `play: question`. Composes multiplicatively with the existing `computeTimeBonusMultiplier`. *Rationale*: keeps the pure function testable and both call sites thin.
- **KTD6 — `useBgMusic` gains `pause`/`resume` and is lifted into React context.** Today it is mute-only and Lobby-scoped (instance-private). Question/preview screens consume it to duck the ambient track. Pause is unconditional while question audio plays; the mute state is preserved on resume.
- **KTD7 — TV drives readiness off audio-load for preview-slot audio.** `MediaPreviewScreen` currently auto-signals *failure* for non-image media (no image URL resolves), which skips the preview. Preview-slot audio must instead signal `MEDIA_LOADED` when the audio clip is ready (and the image, if both present).

### High-Level Technical Design

**Audio behavior matrix** (from `audio.play` × `audio.role`):

| `play` | `role` | Phase audio plays in | Options visible during audio? | Scored / amplified? | Meaning |
|---|---|---|---|---|---|
| `preview` | `subject` | `MEDIA_PREVIEW` | No (locked) | Scored on the following `QUESTION` (normal bonus) | Listen-first |
| `question` | `subject` | `QUESTION` | Yes | **Yes — amplified** | Answer-while-playing |
| `question` | `background` | `QUESTION` | Yes | Normal | Background music |
| `preview` | `background` | — | — | — | **Rejected in validation** |

**Preload lookahead sequence** (deterministic path; `[both orchestrators]`):

```mermaid
sequenceDiagram
    participant S as Server/Controller
    participant TV as TV host
    Note over S: sendQuestion(q[i]) — QUESTION phase begins
    S->>TV: QUESTION (q[i], incl. audio)
    S->>S: peek next = questions[i+1]
    alt next has media/audio AND path is deterministic
        S->>TV: MEDIA_PRELOAD { questionId, image?, audio? }
        TV->>TV: prefetch image (Image.prefetch) + warm audio file
        TV->>S: MEDIA_PRELOADED { success, questionId }
    else adaptive/meta path
        Note over S: skip preload — rely on preview handshake
    end
    Note over S: endQuestion → REVEALING → showRoundResults (RESULTS)
    S->>S: before advancing: require MEDIA_PRELOADED ack<br/>(or timeout backstop)
    S->>S: currentQuestionIndex++ ; showNextQuestion()
    Note over S,TV: next media already warm → preview/question audio starts instantly
```

---

## Implementation Units

### U1. Data model: `audio` on questions (YAML → validator → DB → protocol)
- **Goal**: Extend the question model with the optional `audio` block (KTD1) so authored YAML validates, persists, and reaches clients.
- **Requirements**: Advances "YAML authoring" and "a question may carry both an image and audio."
- **Dependencies**: none (foundational).
- **Files**:
  - `packages/ws-protocol/src/messages.ts` — add `audio?: { url: string; play: 'preview' | 'question'; role: 'subject' | 'background'; duration?: number }` to `Question`; extend `MediaPreviewPayload` to optionally carry `audio`.
  - `packages/db/src/import/validator.ts` — extend `MediaInput`/`QuestionInput`; parse + validate the `audio` block (url required; `play`/`role` enums with defaults; reject `play: preview` + `role: background`).
  - `packages/db/src/schema.ts` — add `audio` to `QuestionWithMeta` and the row type.
  - `packages/db/src/migrations.ts` — append `MIGRATION_V17`: `ALTER TABLE questions ADD COLUMN audio_url TEXT / audio_play TEXT / audio_role TEXT / audio_duration INTEGER`.
  - `packages/db/src/repositories/questions.ts` — extend INSERT columns/values and the row→object mapper.
  - `packages/db/src/import/__tests__/validator.audio.test.ts` — **new** (no validator test exists today).
- **Approach**: `media` stays the image; `audio` is its own block. Defaults applied in the validator (`play='question'`, `role='background'`). Migration follows the V5/V6 `ADD COLUMN` pattern; `runMigrations` applies it on next startup (restart = migrate).
- **Patterns to follow**: existing `media` validation block (`validator.ts:134-149`), INSERT/mapper (`questions.ts:22-24, 87-111`), migration entries (`migrations.ts`).
- **Test scenarios**:
  - Valid `audio` with only `url` → defaults to `play: question`, `role: background`.
  - `subject`+`preview`, `subject`+`question`, `background`+`question` all validate and round-trip through insert→read.
  - `background`+`preview` → validation error naming the field.
  - Missing/empty `audio.url` → validation error.
  - Question with both `media` (image) and `audio` → both persist and read back.
  - Unknown `play`/`role` value → validation error.
- **Verification**: importing a YAML set with each audio combo stores rows with populated `audio_*` columns and reads them back into `QuestionWithMeta.audio`.

### U2. Server + controller: broadcast audio and route preview-slot audio  `[both orchestrators]`
- **Goal**: Include `audio` in the payloads clients receive, and enter the preview phase for listen-first audio even when there's no image.
- **Requirements**: Advances the listen-slot and answer-slot behaviors (delivery of audio metadata to the TV).
- **Dependencies**: U1.
- **Files**: `apps/server/src/room.ts`, `apps/tv-host/src/services/GameController.ts`.
- **Approach**:
  - Include `q.audio` in the `QUESTION` broadcast payload and in the `MEDIA_PREVIEW` payload.
  - Change the preview gate from `if (q.media)` to `if (q.media || q.audio?.play === 'preview')` (`room.ts:998`, `GameController.ts:509`). Preview duration for audio = `q.audio.duration ?? q.media?.previewDuration ?? default`.
  - No server-side playback — the server only carries metadata and phase timing.
- **Patterns to follow**: the existing media-preview block and `sendQuestion` broadcast.
- **Test scenarios** (extend `apps/server/src/__tests__/phase4-media-config.test.ts`):
  - Question with `audio.play: preview` (no image) → server enters `MEDIA_PREVIEW` and waits for `MEDIA_LOADED`.
  - Question with `audio.play: question` → no preview; `QUESTION` payload includes `audio`.
  - Preview duration derives from `audio.duration` when present.
  - Parity: assert the same phase transitions in a `GameController` local-mode test.
- **Verification**: WS client observes `MEDIA_PREVIEW`/`QUESTION` with the correct `audio` payload per combo, in both modes.

### U3. TV: listen-first audio playback in `MediaPreviewScreen`
- **Goal**: Play preview-slot audio on the TV during `MEDIA_PREVIEW`, show an image alongside if present, and drive the `MEDIA_LOADED` handshake off readiness (KTD7).
- **Requirements**: "Listen first, then answer."
- **Dependencies**: U2, U6 (ducking).
- **Files**: `apps/tv-host/src/screens/MediaPreviewScreen.tsx`, `apps/tv-host/src/hooks/useGameController.ts` (if the screen needs `audio` off `mediaPreview`).
- **Approach**: Create/prepare an `expo-audio` player for the preview clip; call `notifyMediaLoaded(true, questionId)` when audio (and image, if any) is ready instead of the current non-image auto-fail (`MediaPreviewScreen.tsx:48-52`). Play for the preview duration; the server's preview countdown ends the phase. Show the image via the existing `<Image>` path when `media.type==='image'` is also present.
- **Patterns to follow**: `safeNotify`/`hasNotifiedRef` at-most-once guard; `useBgMusic`'s `createAudioPlayer` usage.
- **Test scenarios**:
  - Preview-slot audio + no image → audio prepares, `MEDIA_LOADED(true)` fires once, clip audible for the duration.
  - Preview-slot audio + image → image and audio both shown/played; `MEDIA_LOADED` waits for both.
  - Audio load error → `MEDIA_LOADED(false)` (skip preview), matching today's image-error path.
  - Regression: image-only preview still fires `onLoad → MEDIA_LOADED` as before.
- **Verification**: on the TV, a listen-first question plays its clip with options hidden, then transitions to the question with options shown.

### U4. TV: answer-slot audio playback in `QuestionScreen`
- **Goal**: Play `play: question` audio (answer-while-playing subject clips and background music) on the TV during the `QUESTION` phase, stopping at reveal.
- **Requirements**: "Answer while it plays" and background music.
- **Dependencies**: U2, U6 (ducking).
- **Files**: `apps/tv-host/src/screens/QuestionScreen.tsx` (no media surface today).
- **Approach**: When the current question has `audio.play==='question'`, start an `expo-audio` player at phase entry and stop it when the phase leaves `QUESTION` (reveal). Loop background music if the clip is shorter than the timer; play subject clips once (then silence until reveal). No effect on scoring here (U6/U7 handle that).
- **Patterns to follow**: `useBgMusic` player lifecycle; `useGameController` for `currentQuestion`/phase.
- **Test scenarios**:
  - `background`+`question` shorter than timer → loops until reveal.
  - `subject`+`question` → plays once; audio stops at `REVEALING`.
  - Player is torn down on phase change and on unmount (no leak, no bleed into the next question).
  - Question with no `audio` → no player created (regression).
- **Verification**: on the TV, an answer-while-playing question shows options with the clip audible; audio stops at reveal.

### U5. Duck the ambient app music during question audio
- **Goal**: Pause the bundled `useBgMusic` track whenever question audio (preview or answer slot) plays; resume after, preserving mute.
- **Requirements**: "Pause the TV's existing ambient app music while question audio plays; resume after."
- **Dependencies**: none (enables U3/U4).
- **Files**: `apps/tv-host/src/hooks/useBgMusic.ts` (expose `pause`/`resume`), a new `apps/tv-host/src/hooks/BgMusicContext.tsx` (or lift into an existing provider), `apps/tv-host/src/screens/GameScreen.tsx` (mount the provider), consumers in `MediaPreviewScreen.tsx`/`QuestionScreen.tsx`.
- **Approach** (KTD6): add `pause()`/`resume()` to the hook's returned API (today only `{ isMuted, toggleMute, hasTracks }`); provide the `bgMusic` object via context so non-Lobby screens can consume it. Screens playing question audio call `pause()` on mount and `resume()` on cleanup. Resume must not un-mute a user-muted track.
- **Patterns to follow**: existing `playerRef`/mute effect in `useBgMusic.ts:48-52`.
- **Test scenarios**:
  - Question audio starts → ambient `pause()` called; audio ends → `resume()` called.
  - Ambient muted before the question → still muted after resume.
  - No overlap: ambient and question audio never audible simultaneously (assert pause precedes question-audio play).
- **Verification**: manual/e2e — during a listen-first or background-music question, the app track is silent and returns afterward.

### U6. Amplified speed scoring for answer-while-playing questions  `[both orchestrators]`
- **Goal**: Weight the time bonus up for `role: subject` + `play: question` questions (KTD4).
- **Requirements**: "Amplified speed scoring for answer-while-playing questions."
- **Dependencies**: U1.
- **Files**: `packages/game-logic/src/utils/scoring.ts`, `packages/game-logic/src/__tests__/scoring.test.ts`, `apps/server/src/room.ts` (call site ~1357/1371), `apps/tv-host/src/services/GameController.ts` (call site ~744/759).
- **Approach**: add optional `speedBonusMultiplier = 1` to `calculateScore`, applied to `timeBonus` before returning; export `SUBJECT_SPEED_BONUS_MULTIPLIER`. Both call sites compute the factor from the active question (`isSubject && playDuringQuestion ? SUBJECT_SPEED_BONUS_MULTIPLIER : 1`) and pass it. The existing `computeTimeBonusMultiplier` still applies on top at `adjustedScore`.
- **Patterns to follow**: existing `calculateScore` signature and the `adjustedScore` computation.
- **Test scenarios**:
  - Answer-while-playing correct answer scores strictly higher than an identical non-amplified answer at the same response time.
  - Multiplier of `1` reproduces current behavior exactly (regression across existing `scoring.test.ts` cases).
  - Incorrect answer → still zero regardless of multiplier.
  - Amplifier composes with `computeTimeBonusMultiplier` (both applied), not one replacing the other.
  - Parity: assert identical scores from the `room.ts` and `GameController.ts` paths for the same inputs.
- **Verification**: unit tests pass; a subject answer-while-playing question shows a larger bonus than a normal question for the same speed.

### U7. Media preloading / one-question lookahead  `[both orchestrators]`
- **Goal**: Warm the next question's media on the host during the current question and hold the advance until it's ready (KTD2, KTD3, KTD4).
- **Requirements**: "Host-side preloading / one-question lookahead" + "hold and advance only when the media is in hand."
- **Dependencies**: U1, U2.
- **Files**: `packages/ws-protocol/src/messages.ts` (add `MEDIA_PRELOAD` server→host + `MEDIA_PRELOADED` host→server), `apps/server/src/room.ts`, `apps/tv-host/src/services/GameController.ts`, TV consumer (a preload handler in `useGameController.ts`/controller wiring), `apps/server/src/__tests__/phase4-media-config.test.ts`.
- **Approach**:
  - On `sendQuestion(q[i])`, peek `questions[i+1]`; if the path is deterministic and the next question has `media`/`audio`, broadcast `MEDIA_PRELOAD` with the url(s) + `questionId`.
  - TV prefetches: `Image.prefetch` for images; warm the audio file (fetch/prepare an `expo-audio` player) for audio. Ack `MEDIA_PRELOADED { success, questionId }`.
  - In `showRoundResults`, gate the `resultsTimeout` advance on the ack for the upcoming question (hold-until-ready) with a timeout backstop so a dead/slow host can't wedge the game.
  - Adaptive/meta path: skip preload entirely; rely on the existing `MEDIA_LOADED` preview handshake.
  - Reuse the `questionId` stale-guard pattern from `onMediaLoaded`.
- **Patterns to follow**: `MEDIA_PREVIEW`/`MEDIA_LOADED` message + handler shape; the timing-state fields (`room.ts:157-164`) and timeout backstop pattern.
- **Test scenarios**:
  - Deterministic game, next question has media → `MEDIA_PRELOAD` sent during current `QUESTION`; advance waits for `MEDIA_PRELOADED`.
  - Host never acks → advance proceeds after the backstop timeout (no wedge).
  - Adaptive/meta game → no `MEDIA_PRELOAD` sent; preview handshake still gates the media question.
  - Stale `MEDIA_PRELOADED` (wrong `questionId`) ignored.
  - Last question (no `i+1`) → no preload, clean game-over.
  - Parity in `GameController` local mode.
- **Verification**: in a deterministic media-heavy game, consecutive media questions start with no visible download wait; adaptive games still function via the fallback.

---

## Verification Contract

- `yarn server typecheck` and the workspace type checks pass (new protocol/schema types wired through).
- `yarn lint` passes.
- Unit/integration tests pass, including the new/extended: `validator.audio.test.ts`, `scoring.test.ts`, `phase4-media-config.test.ts`, `gameSlice.test.ts` (media-preview transitions still hold).
- Both orchestrators exercised: server tests for `room.ts`, and local-mode assertions for `GameController.ts`, show identical phase/scoring behavior.
- Manual/e2e on the TV: listen-first, answer-while-playing, and background-music questions each behave per the success criteria; ambient music ducks and resumes; a media-heavy deterministic game plays with no inter-question stall.
- DB: after restart, `PRAGMA user_version` = 17 and `audio_*` columns exist.

## Definition of Done

- All success criteria in the Product Contract are met on both hosted and local modes.
- Every `[both orchestrators]` unit lands as parallel, behaviorally identical edits in `room.ts` and `GameController.ts`.
- Preloading delivers no-wait playback on deterministic games and degrades gracefully (no wedge, no crash) on adaptive/meta games.
- Amplified scoring applies only to `role: subject` + `play: question` questions and leaves all other scoring unchanged.
- Verification Contract passes.

---

## Risks & Dependencies

- **Two-orchestrator drift** — the biggest risk. `room.ts` and `GameController.ts` must stay in lockstep; a change applied to only one silently breaks one mode. Mitigation: pair every game-logic edit, and add parity assertions where feasible.
- **Web-TV autoplay policy** — browsers block audio without a prior user gesture. Native TV (primary target) is unaffected. Mitigation: unlock the audio context on the existing host interaction (game start / lobby), before any question audio plays.
- **Adaptive/meta preload gap** — those games can't preload (KTD3); a media question there may show the existing brief at-preview load. Accepted and documented, not a regression.
- **`expo-audio` player lifecycle** — creating players per question risks leaks/overlap. Mitigation: strict teardown on phase change/unmount (U4), and reuse the warmed preload player where possible.
- **Dependency**: mobile app has no audio dependency and needs none — confirmed no change.

## Scope Boundaries

### Deferred to Follow-Up Work
- Update the external `unfairenough-question-creator` skill schema reference (lives under `~/.claude/skills/`, outside this repo) to document the `audio` block — a documentation task once the format lands.
- Optional: forcing sequential ordering for adaptive games to enable preload there (explicitly out of this plan per confirmed scope).

### Outside this feature
- Phone-side audio, cross-device sync, video playback, and any change to the bundled app-music track set.

---

## Sources & Research
- Product Contract: this document (from `/ce-brainstorm`, 2026-07-04).
- Architecture dossier (file:line): `/tmp/compound-engineering/ce-brainstorm/audio-questions/grounding.md`.
- Integration-seam recon (file:line anchors used throughout the units): two orchestrators `apps/server/src/room.ts` + `apps/tv-host/src/services/GameController.ts`; advance loop `room.ts:1468-1475` / `GameController.ts:842-851`; media-preview block `room.ts:998-1032`; MEDIA_LOADED handler `room.ts:1036-1075`; scoring call sites `room.ts:1357,1371` / `GameController.ts:744,759`; protocol `packages/ws-protocol/src/messages.ts:102-124,199-206`; validator `packages/db/src/import/validator.ts:6-10,134-149`; migrations `packages/db/src/migrations.ts:36-38`; repo INSERT/mapper `packages/db/src/repositories/questions.ts:22-24,87-111`; `useBgMusic` `apps/tv-host/src/hooks/useBgMusic.ts`; mobile no-op confirmation `apps/mobile/src/screens/PlayScreen.tsx:67`.
