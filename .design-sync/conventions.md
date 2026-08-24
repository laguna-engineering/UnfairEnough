# Unfair Enough! UI — how to build with this design system

This is the component library for **Unfair Enough!**, a multiplayer quiz game. It
is a **React Native** library (built for phones and TV) rendered on the web via
react-native-web. That shapes every convention below — it does **not** work like a
CSS/Tailwind design system.

## Styling idiom: props + a React Native `style` object — never CSS classes

There are **no CSS classes** and no `className`. You style in two ways:

1. **Component props** carry the design language. Pick the look with enum props,
   not styles: `Button` takes `variant` (`primary` | `secondary` | `outline`) and
   `size` (`small` | `medium` | `large`); `Card` takes `variant`
   (`default` | `elevated` | `glow`); `AnswerButton` takes `state`
   (`default` | `selected` | `correct` | `incorrect` | `disabled`). Reach for a prop
   before a style.
2. The **`style` prop** takes a **React Native style object**, not CSS: camelCase
   keys and unitless numbers — `{ padding: 16, borderRadius: 12, backgroundColor:
   colors.card }`. No strings like `"16px"`, no `class`.

## Use the exported theme tokens for every custom value

The bundle exports the "Neon Sakura" theme alongside the components — import and use
these, never hand-picked hex:

- `colors` — `primary` (#F5619E pink), `secondary` (#89D4FF sky blue), `accentYellow`,
  `accentPurple`, `background` (#0b1e3a), `card` (translucent white,
  rgba(255,255,255,0.055)), `textPrimary` (#FFF), `textSecondary`, `success`, `error`.
- `gradients` — named `as const` tuples: `screenBackground`, `card`, `primary`,
  `answerA`–`answerD`, `timerHealthy`/`timerWarning`/`timerDanger`, `winner`, …
- `playerColors` — a 12-color array to assign per player.
- `spacing`, `borderRadius`, `shadows`, `typography`, `tvSafeArea` — the scales.

## Dark theme + wrapping

Every screen sits on a **dark** deep-indigo ground. Wrap a screen's content in
**`ScreenBackground`** (it fills its parent with the `screenBackground` gradient);
put light text on top (`colors.textPrimary`). Components assume this dark context —
placing them on a white page will look wrong.

**Fonts** (Fredoka for titles/timer, Nunito for body/labels/buttons) ship inside
`styles.css` as `@font-face`, so they are already applied — nothing to set up. When
you write your own layout text, set `fontFamily` to a shipped family
(`'Fredoka_600SemiBold'`, `'Nunito_400Regular'`, `'Nunito_600SemiBold'`,
`'Nunito_700Bold'`) or your text falls back to a serif.

## Where the truth lives

Read the per-component `<Name>.d.ts` for the exact prop contract before composing —
e.g. `Leaderboard` wants an `entries: LeaderboardEntry[]`, `PositionChart` wants
`players` + `positionHistory`. The preview card for each component shows a real,
idiomatic composition.

Note: components carry TV-remote focus props (`hasTVPreferredFocus`, `nextFocusUp`,
…) that are inert on web — ignore them when building web screens.

## One idiomatic composition

```jsx
import { ScreenBackground, Card, Button, Timer, colors } from '<this design system>';

function QuestionScreen() {
  return (
    <ScreenBackground style={{ alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Timer seconds={12} totalSeconds={20} />
      <Card variant="elevated">
        <div style={{ color: colors.textPrimary, fontFamily: 'Nunito_700Bold', fontSize: 20 }}>
          Which ocean is the largest?
        </div>
      </Card>
      <Button title="Lock in answer" variant="primary" onPress={() => {}} />
    </ScreenBackground>
  );
}
```
