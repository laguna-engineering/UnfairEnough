---
title: New Question Types - Plan
type: feat
date: 2026-08-15
topic: new-question-types
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# New Question Types - Plan

## Goal Capsule

- **Objective:** Add three new question types to Unfair Enough! — two-choice (true/false and "this or that"), closest wins (numeric estimation), and predict the room (poll + prediction) — playable in both hosted and TV-local modes.
- **Product authority:** This plan owns the three types above. Adjacent ideas surfaced during the brainstorm (guess & bet, observation rounds, round modifiers, majority-match) are not active scope; see Scope Boundaries.
- **Open blockers:** None. Remaining forks are deferred to planning (see Outstanding Questions).

---

## Product Contract

### Summary

Three new question types join the existing 4-option multiple choice: **two-choice** (true/false and either/or questions rendered as two large tiles), **closest wins** (everyone privately submits a number; proximity to the real answer scores), and **predict the room** (an opinion poll where predicting the winning option is what scores). All three use only tap and slider/number inputs, are audience-neutral, and reduce the adult-knowledge bias by design.

### Problem Frame

Every round today is the same shape: a question, four options, fastest correct answer wins the most points. Over a full game this gets monotonous, and it consistently rewards the players with the most trivia knowledge — usually the adults. The game's whole identity ("Unfair Enough!") is that trailing players — in practice, the kids — get structural help: catch-up multipliers and per-player tag-strength question selection already exist. But no amount of scoring math changes the fact that every round is a knowledge test. The shared-TV-plus-private-phones setup is also underused: phones are currently just answer buttons, and the TV never gets a reveal moment more dramatic than "the answer was B."

Round types where knowledge doesn't decide the winner — estimating an unknowable number, reading the room's opinion — attack the bias at the mechanic level instead of the scoring level, and their reveals (a number line of everyone's named guesses, a live poll split) give the TV something worth watching.

### Key Decisions

- KD1. **Batch is two-choice, closest wins, and predict the room** (session-settled: user-directed — chosen over including majority-match, which the user excluded, and over adding the guess & bet flagship, deferred to keep the batch cheap). Governs R1–R13.
- KD2. **Phone input budget is tap + slider/number pad only** (session-settled: user-directed — chosen over allowing short-text input: typing speed differences penalize young kids and unmoderated text would reach the TV). Governs R6, R11.
- KD3. **Kid advantage comes from knowledge-light mechanics plus the existing trailing-player machinery, never from explicit kid/age flags** (session-settled: user-directed — the game already tilts toward whoever is behind via catch-up multipliers and tag-strength-aware question selection; new types plug into that instead of tagging players by age). Governs R3, R8, R16.
- KD4. **Closest-wins scoring is distance-scaled with no speed bonus** (session-settled: user-approved — everyone who guesses scores by proximity rather than sole-closest-takes-all, and answering fast earns nothing, because rewarding speed undercuts thoughtful estimation). Governs R8.
- KD5. **In predict the room, only the prediction scores; the vote is unscored input** (session-settled: user-approved — scoring the vote would punish honest opinions; the game is reading the room, not having the right taste). Governs R12, R13.

### Requirements

**Two-choice**

- R1. Players can be asked true/false questions and "this or that" questions (two arbitrary options, e.g. "Pizza or pasta?"); both render as exactly two large answer tiles on the TV and on each phone.
- R2. Authors can declare a question true/false without writing options; the True/False labels are provided by the game and localized (English and Italian). "This or that" questions carry their two authored options.
- R3. Two-choice questions score exactly like existing multiple choice: base points plus time bonus, with the existing catch-up multipliers applied.

**Closest wins**

- R4. A closest-wins question asks for a number ("How many teeth does a snail have?"); each player privately submits a numeric guess on their phone within the time limit.
- R5. Authors specify the correct value and the guessable range (minimum and maximum); the range bounds the phone's input widget.
- R6. The phone input is a slider or number pad — no typing of free text.
- R7. Guesses stay private during the round: the TV shows only the question, the range, and how many players have locked in.
- R8. Every player who submitted scores by proximity to the correct value — closer earns more, with the closest guess earning the most; response speed earns nothing. Catch-up multipliers still apply.
- R9. The reveal shows the correct value and every player's named guess positioned relative to it (a number-line moment on the TV), then the points earned.

**Predict the room**

- R10. A predict-the-room question is an opinion poll with 2–4 tap options and no correct answer ("What's the best pizza topping?").
- R11. During the round each player privately submits two inputs on their phone, in order: their own vote, then their prediction of which option the room will pick most.
- R12. A player scores only for a correct prediction; votes are never scored. If the top options tie, every prediction of a tied option counts as correct.
- R13. The reveal shows the poll's vote distribution and which players predicted right; there is no right/wrong answer moment.

**Compatibility and pacing**

- R14. All three types work identically in hosted mode and TV-local mode.
- R15. Question sets can mix types freely, and the existing question-selection engine interleaves them within a game; existing 4-option sets and questions keep working unchanged.
- R16. Predict-the-room questions are knowledge-free, so per-player tag-strength difficulty personalization does not apply to them; selection treats them as pacing variety, not as difficulty-tuned content.

### Key Flows

- F1. Closest-wins round
  - **Trigger:** The selection engine serves a closest-wins question.
  - **Steps:** TV shows the question and range with the timer; each phone shows the slider/number pad; players adjust and lock in; TV counts lock-ins without showing values; on timeout or all-in, the reveal places the true value and all named guesses on a number line; scores apply per R8.
  - **Covers:** R4–R9.
- F2. Predict-the-room round
  - **Trigger:** The selection engine serves a predict-the-room question.
  - **Steps:** TV shows the poll question and options; each phone asks for the player's vote, then flips to ask for their prediction, both within the same timer; the reveal shows the vote distribution, highlights the winning option, and names the correct predictors; scores apply per R12.
  - **Covers:** R10–R13.

Two-choice needs no new flow — it follows the existing question round flow with two tiles instead of four.

### Acceptance Examples

- AE1. **Covers R2.** Given an Italian-language game and a true/false question, when the question is served, then the two tiles read "Vero" and "Falso" without the author having written any options.
- AE2. **Covers R8.** Given a closest-wins question with correct value 25 and guesses of 20, 30, and 100, when the round resolves, then the players who guessed 20 and 30 earn the same points as each other and strictly more than the player who guessed 100, regardless of who answered first.
- AE3. **Covers R11, R12.** Given a player who voted but let the timer expire before predicting, when the round resolves, then their vote counts in the distribution and they score zero.
- AE4. **Covers R12.** Given a 12-player poll where two options receive 5 votes each, when the round resolves, then every player who predicted either of those two options scores.
- AE5. **Covers R15.** Given an existing question set with no type declared on its questions, when it is imported and played, then every question behaves as 4-option multiple choice exactly as before.

### Success Criteria

- Each new type is self-explanatory in play: a first-time player can complete a round correctly with at most one line of instruction on the TV — no tutorial screen.
- A mixed-type game visibly changes rhythm: knowledge-light rounds (closest wins, predict the room) give non-trivia-strong players real scoring moments, observable as those players winning some rounds outright.

### Scope Boundaries

**Deferred for later**

- **Guess & bet** (Wits & Wagers-style: submit a guess, then bet on anyone's guess) — the strongest form-factor showpiece from the research, deferred because its two-phase round needs new phase machinery; natural follow-up once this batch proves out.
- **Speed/observation rounds** (spot-the-symbol, flash-memory) — the strongest evidence-backed kids-beat-adults mechanics, deferred because they need visual asset authoring and a new TV renderer; natural next batch.
- **Round modifiers** (confidence wagers, bet-on-a-player, forced-answer "screw", trailing-player-picks-category) — a separate layer that composes with all types; its own brainstorm.
- **Predict-the-room variants** (majority-match scoring where matching the herd scores, word-cloud polls) — cheap variants once the poll type exists; majority-match itself was excluded from this batch by the user.

**Outside this batch's identity**

- Typing-based bluffing types (Fibbage-style fake answers) — excluded by KD2's input budget.
- Explicit kid/age player flags or handicaps — against KD3; the trailing-player machinery is the only tilt.

### Dependencies / Assumptions

- The catch-up scoring machinery (per-question time-bonus multipliers, tag-strength-aware selection) is assumed to extend to the new types' scoring shapes without redesign; planning verifies this.
- Authoring conventions for question creators (currently "always 4 options A–D") must be extended to cover the three new types when content is first authored for them.

### Outstanding Questions

**Deferred to Planning**

- The exact distance-to-points curve for closest wins (linear vs steeper falloff; whether a maximally wrong guess earns zero or a floor).
- Slider granularity and range presentation on the phone (step size, logarithmic ranges for large numbers, unit display).
- How poll questions interact with question freshness/usage tracking, given they have no difficulty signal (R16 sets the product rule; the mechanism is planning's).
- Whether the TV shows live lock-in indicators per player or only a count during closest-wins rounds.

### Sources

- Data layer groundwork already exists: the question `type` field (`multiple_choice | true_false`) is validated, stored, and sent over the wire but never rendered — `packages/db/src/import/validator.ts`, `packages/db/src/schema.ts`, `packages/ws-protocol/src/messages.ts`. The 2-option and true/false validation rules are already enforced on import.
- The 4-option assumption lives in the answer-key type (`A–D`) and the 2×2 tile grids in `apps/tv-host/src/screens/QuestionScreen.tsx` and `apps/mobile/src/screens/PlayScreen.tsx`, plus the per-key tile palette in `packages/ui/src/theme/themes.ts`.
- Scoring and both game loops: `packages/game-logic/src/utils/scoring.ts`, consumed by `apps/server/src/room.ts` (hosted) and `apps/tv-host/src/services/GameController.ts` (local) — the dual call sites are why R14 is called out explicitly.
- Mechanic provenance: closest wins descends from Kahoot's slider format and Wits & Wagers; predict the room from poll-plus-prediction engagement formats; both chosen from research into party games where kids reliably compete with adults (estimation and social reading neutralize trivia knowledge).
- An earlier plan sketched `sorting` and `multi_select` as future types: `docs/plans/2026-02-06-feat-adaptive-quiz-engine-plan.md`.
- Companion design brief for screen mocks: `docs/design/2026-08-15-new-question-types-design-brief.md`.
