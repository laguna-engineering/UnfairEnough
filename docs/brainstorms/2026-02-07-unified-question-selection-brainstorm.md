# Unified Question Selection Engine

**Date**: 2026-02-07
**Status**: Decided

## What We're Building

A unified question selection system that works identically in both hosted and local game modes. Two pure functions in `packages/game-logic/`:

1. **Pool Builder** (`buildQuestionPool`) — Curates a subset from all available questions before the game starts.
2. **Per-Round Picker** (`selectNextQuestion` — enhanced) — Selects the next question from the pool during the leaderboard screen, with a phased ramp from random to adaptive.

### Pool Acquisition (mode-specific)

- **Hosted mode**: Server downloads questions from DB and sends the full pool to the TV client before game start.
- **Local mode**: The pool is the YAML file loaded by the game master — no server needed.

### Pool Composition (shared logic)

- **With player tag scores**: Half the pool targets each player's strong topics; the other half is a mix fitting other players.
- **Without tag scores (cold start)**: Balanced tag diversity — questions are picked to cover a wide spread of tags.
- Both modes call `buildQuestionPool()` to curate from available questions.

### Per-Round Selection (shared logic)

- Runs during the leaderboard screen after each round.
- **Phase ramp** based on `roundIndex / totalRounds`:
  - Rounds 0–25%: Mostly random selection.
  - Rounds 25–100%: Progressively weighted toward catch-up (easier for trailing players, harder for leaders).
- **Tag scores are optional**: Without them, catch-up uses only in-game score gaps.
- Enhances the existing `selectNextQuestion` algorithm with the phase parameter.

### Player Tag Scores in Local Mode

- If network is available: fetch player profiles/tag scores from the server at game start.
- If no network: start cold — catch-up relies only on in-game performance from earlier rounds.

## Why This Approach

- **Unification**: Same YAML input, same algorithm, same behavior in both modes. The local `GameController` currently lacks dynamic selection, tag scoring, and difficulty multipliers — this closes the gap.
- **Reactive**: Per-round selection adapts to actual in-game performance, unlike a pre-ordered sequence that can't account for surprises.
- **Graceful degradation**: Works with or without tag scores, with or without network. The system improves with more data but doesn't require it.
- **Testable**: Pure functions with clear inputs/outputs — easy to unit test.

## Key Decisions

1. **Approach 1 chosen** over pre-ordered sequences (can't react to in-game scores) and pool-only unification (doesn't achieve feature parity).
2. **Phase ramp lives in the per-round picker**, not in pool ordering. The picker adjusts its randomness-vs-catch-up weighting based on game progress.
3. **Tag scores are optional** — the system works without them (cold start or no network).
4. **Pool composition is smart in both modes** — even if the YAML has more questions than needed, a balanced subset is selected.

## Open Questions

- How should the pool builder handle a YAML file that has fewer questions than `nPlayers * nRounds`? Fall back to using all available questions?
- Should the "half strong topics" ratio be configurable, or is 50/50 a good fixed default?
- When fetching tag scores in local mode, what endpoint/API should the TV app call? Does this imply a lightweight "profile server" separate from the game server?
