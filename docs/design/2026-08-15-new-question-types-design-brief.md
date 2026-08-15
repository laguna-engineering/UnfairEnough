# Design brief: new question types — screen mocks

A brief for Claude Design, working with the synced **Unfair Enough!** design system (`@unfairenough/ui`, "Neon Sakura"). The goal is mocks for three new question types: **two-choice**, **closest wins**, and **predict the room**. Each type needs both surfaces — the shared TV screen everyone watches and the private phone screen each player holds — and each needs its answering state and its reveal state.

## The game in one paragraph

Unfair Enough! is a living-room quiz: a TV shows the questions, up to 12 players answer on their own phones. Today every question is 4-option multiple choice — colored tiles A–D on the TV, matching tap tiles on the phone. The three new types break that monotony and reduce the trivia-knowledge advantage: two-choice is the familiar loop with two big tiles, closest wins has everyone guess a number and scores by proximity, predict the room is an opinion poll where you score by predicting the winning option, not by your own vote. The phones are private (players shield them from neighbors — there's an existing peek-guard pattern on the answer screen); the TV is where the drama lands.

## Working with the design system

- Everything sits on the dark deep-indigo `ScreenBackground` gradient. Use the exported tokens (`colors`, `gradients`, `spacing`, `borderRadius`, `typography`, `playerColors`) — never hand-picked hex. Titles and the timer use Sniglet; body, labels, and buttons use Nunito.
- Existing components to reuse where they fit: `AnswerButton` (states: default/selected/correct/incorrect/disabled), `Card`, `Timer`, `Leaderboard`, `ScreenBackground`. Check each component's prop contract before composing.
- The four `answerA`–`answerD` gradients define the answer-tile language. Two-choice tiles should feel like siblings of those tiles, not a new species.
- TV mocks are landscape, designed for 10-foot readability with generous `tvSafeArea` margins. Phone mocks are portrait, one-hand thumb reach, with tap targets sized for excited kids.
- `playerColors` assigns each of the up to 12 players a stable color — use it anywhere a player appears on the TV (guess markers, predictor badges).

## Screens to mock

### 1. Two-choice (true/false and "this or that")

The cheapest type visually, but it must not look like a broken 4-option screen.

- **TV, answering:** question text up top with the `Timer`, then two large tiles side by side filling the space four tiles used to. Two flavors of the same layout: true/false (game-provided "True"/"False" labels — consider giving these a fixed identity, e.g. check/cross iconography, rather than reusing A/B letter styling) and this-or-that (two authored options, e.g. "Pizza" / "Pasta", which can be longer text).
- **Phone, answering:** two big stacked or side-by-side tap tiles mirroring the TV, with the selected state clearly visible to the holder but glanceable-proof (peek-guard pattern).
- **Reveal:** same as the existing flow — correct tile celebrates, wrong tile dims.

### 2. Closest wins (numeric estimation)

The new input widget lives here; this is the batch's biggest design lift.

- **Phone, answering:** a numeric guess input bounded by an authored min–max range — a slider with a large live readout of the current value, and/or a number pad. Needs a clear "lock in" action and a locked-in state. No free text. Design for both small ranges (0–50) and large ones (0–100,000).
- **TV, answering:** the question, the guessable range, the `Timer`, and a lock-in counter ("7 of 9 locked in"). Player guesses must NOT appear here — suspense is the point.
- **TV, reveal — the money screen:** a horizontal number line. The correct value lands with emphasis; every player's guess appears as a named, `playerColors`-colored marker positioned by proximity. Handle collisions (several players guessing near-identical values) and the far-outlier ("Dad guessed 1,000,000") gracefully — the outlier moment is a laugh, give it room. Then points: closer = more, no speed component.
- **Phone, reveal:** the player's own guess vs the correct value, distance, and points earned.

### 3. Predict the room (poll + prediction)

Two inputs on the phone in one timed round — the design must make the mode switch impossible to miss.

- **Phone, answering, step 1 — your vote:** the poll options (2–4) as tap tiles under an unmistakable "What do YOU pick?" framing.
- **Phone, answering, step 2 — your prediction:** the same options re-presented under a visually distinct "What will the ROOM pick?" framing — different accent color, header, or motif, so nobody scores zero because they thought they were still voting. Show the player's own already-cast vote as a small reminder.
- **TV, answering:** the poll question and options, the `Timer`, and progress ("5 voted · 3 predicted"). No live distribution — that would contaminate predictions.
- **TV, reveal:** the vote distribution as animated bars per option, the winning option crowned, then the predictors who called it highlighted with their `playerColors` badges. Votes are anonymous in the reveal; only correct predictors are named. There is no right/wrong answer moment — this screen celebrates the room's taste and the good predictors.
- **Phone, reveal:** whether your prediction hit, and points earned.

## New components these mocks will likely introduce

Name and design these as reusable DS pieces:

- A bounded **numeric slider/pad input** (phone) with live readout and lock-in.
- A **number-line reveal** (TV) with named, colored player markers and collision/outlier handling.
- **Poll result bars** (TV) with a winner state and predictor badges.
- A **two-step input indicator** (phone) for the vote → predict mode switch.

## Out of scope for these mocks

Lobby, countdown, leaderboard, and game-over screens are unchanged. No typing inputs anywhere. No new screens for the existing 4-option type.
