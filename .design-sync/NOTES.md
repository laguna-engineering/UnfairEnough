# design-sync notes — @unfairenough/ui

This is a **React Native** design system synced to claude.ai/design by rendering it
on the web through **react-native-web**. It is off the converter's default envelope
(which expects a web build); the specifics below are what make it work.

## Build invocation

- **No build step / no `dist/`.** `@unfairenough/ui` ships TS source (`main: src/index.ts`).
  The converter runs in **synth-entry mode** (`[NO_DIST]` … "synthesizing from N src files"),
  bundling from `src/`. There is **no `buildCmd`** — don't add one.
- **`--node-modules` = repo root** (`./node_modules`), not `packages/ui/node_modules`.
  yarn hoists `react`, `react-native-web`, `expo-linear-gradient`, `react-native-svg`
  to the root; the package's own `node_modules` is sparse.
- `PKG_DIR` resolves to the workspace symlink `node_modules/@unfairenough/ui`, **not**
  `packages/ui`. That is why `cfg.extraFonts` is `../../../.design-sync/fonts.css`
  (three `..`: `ui` → `@unfairenough` → `node_modules` → repo root). If the package
  scope/name or hoisting changes, re-derive this depth.

## The two declared lib forks (`.design-sync/overrides/`)

- **`bundle.mjs`** — adds react-native-web resolution to the esbuild bundle only:
  `alias react-native→react-native-web`, `.web.*` resolveExtensions, `.js`-as-JSX
  loader, browser conditions/mainFields, `__DEV__`. Only `sharedBuildOptions` is
  changed; the output contract (header/footer) is untouched.
- **`previews.mjs`** — adds a **preview-only** esbuild `banner` that renames RNW's
  injected `<style id="react-native-stylesheet">`. That element's id starts with "r"
  and its rules are in CSSOM (empty `innerHTML`), so `package-validate`'s
  `#root, [id^="r"]` root selector picks it first and false-flags every card as
  `[RENDER] root empty`. The banner lands only in `_preview/*.js`, never in the
  uploaded `_ds_bundle.js`. Both forks need the `.design-sync/node_modules` symlink
  (`ln -sfn ../.ds-sync/node_modules .design-sync/node_modules`) so `esbuild` resolves
  from the fork location — recreate it on a fresh clone.

## Fonts

- Brand fonts **Fredoka** (titles/timer) and **Nunito** (400/600/700, body/label/button)
  are set by `packages/ui/src/theme/typography.ts` as bare `fontFamily` strings
  (`Fredoka_600SemiBold`, `Nunito_400Regular`, `Nunito_600SemiBold`, `Nunito_700Bold`).
  RNW emits those literal names as CSS `font-family`; without shipped `@font-face` the
  web falls back to serif. The converter's font scrape can't see them (they're in JS,
  not CSS) so no `[FONT_MISSING]` fires — this had to be found by eye on a text-heavy
  preview.
- Fixed by shipping `.design-sync/fonts.css` + the 4 TTFs under `.design-sync/fonts/`
  (committed, node_modules-independent), wired via `cfg.extraFonts`. The `@font-face`
  family names **must match the typography.ts strings verbatim**.

## Render check environment

- No chromium cache on this machine; used **system Chrome** via
  `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
  Set that env var before every `package-validate.mjs` / `package-capture.mjs` run.
  `playwright` is at the repo root.

## Known render warns (triaged legitimate)

- **`[CSS_RUNTIME]`** — expected. RNW is CSS-in-JS; the bundle self-styles at runtime,
  styles.css only imports the fonts. Not a miss.
- **`[GRID_OVERFLOW]` Leaderboard** — handled with `cfg.overrides.Leaderboard.cardMode: "column"`.

## Re-sync risks (watch-list)

- **RNW stylesheet id.** The `previews.mjs` banner targets `react-native-stylesheet`.
  If a future react-native-web version renames or restructures that element, the
  `[RENDER] root empty` false-positive returns — re-check the banner against RNW's
  StyleSheet registry.
- **RN-web resolution.** Pinned to react-native-web 0.21, expo-linear-gradient ^15,
  react-native-svg ^15. A major bump of any could change `.web.*` entry points or
  ship JSX differently — re-run the spike (bundle Button + PositionChart) if renders break.
- **`extraFonts` path depth** is tied to the node_modules symlink layout (see above).
- **Preview glue text** hardcodes the brand family strings (`Nunito_700Bold`, etc.) in
  `Card.tsx` / `ScreenBackground.tsx` / `RankChangeIndicator.tsx`. If typography.ts
  renames a family, update those previews **and** `fonts.css`.
- **TV focus props** (`hasTVPreferredFocus`, `nextFocus*`) are inert on web — documented
  in `conventions.md`; they still appear in the `.d.ts` (real RN API).
