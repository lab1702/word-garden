# Visual Refresh v2 — "Refined Classic, Rich & Tactile" Design

## Goal

Make Word Garden look noticeably more appealing while staying dark-themed. Evolve
the existing indigo / gold / green identity (don't replace it), introduce a real
typographic voice, and give surfaces and tiles tactile depth — bevels, gloss,
inset wells, soft glow.

This is a **visual refresh only**: CSS, design tokens, fonts, and minimal markup.
No game logic, routing, data, or API changes.

## Direction (locked via visual brainstorming)

Three decisions were validated against live mockups:

1. **Direction — Refined Classic.** Keep the deep-indigo background, warm gold
   tiles, and green accent. Push polish, depth, and hierarchy further.
2. **Typography — Display serif + clean sans.** Fraunces (characterful display
   serif) for the brand wordmark, large titles, scoreboard numerals, and tile
   letters. Inter (clean sans) for all UI and body text.
3. **Finish — Rich & Tactile.** Pronounced 3D bevels on tiles, glossy gold tile
   faces, inset board "wells", radial-gradient premium squares, a wooden rack,
   gradient/glow buttons, and a subtle vignette background.

The approved composite mockup lives at
`.superpowers/brainstorm/<session>/content/full-preview.html` and is the visual
target of record.

## Constraints

- **Offline / self-contained.** App runs behind a reverse proxy under a `/word`
  base path. Fonts must be **bundled and self-hosted**, never hot-linked to
  Google Fonts.
- **Dark theme only.** No light mode in scope.
- **Token-driven.** Build on the existing CSS custom properties in
  `packages/client/src/styles/theme.css` and the per-component CSS Modules.
  Prefer changing tokens over hard-coding values in components.
- **No behavior changes.** Existing component markup stays as-is except for the
  small additions noted below. All current tests must continue to pass.
- **Accessibility preserved.** Maintain WCAG-AA text contrast, keep the existing
  `:focus-visible` treatment, and gate all new motion behind
  `prefers-reduced-motion`.

## Architecture / Approach

The styling system already has the right shape: a single token file
(`theme.css`) plus CSS Modules per component. The refresh works entirely within
it:

1. **Add fonts** as bundled dependencies and import them once at app entry.
2. **Extend the token layer** — new font tokens, a richer palette, and new
   gradient/bevel/glow tokens — so components mostly inherit the new look.
3. **Update component CSS Modules** to apply depth (bevels, inset wells,
   gradients, glow) using the new tokens.
4. **Two tiny markup touches** (header tagline span, optional wordmark wrapper)
   in `App.tsx` — everything else is CSS-only.

### 1. Fonts

- Add dev/runtime dependencies in `packages/client`:
  - `@fontsource-variable/fraunces`
  - `@fontsource-variable/inter`
- Import both once in `packages/client/src/main.tsx` (above the global CSS
  import). `@fontsource` self-hosts the woff2 files through Vite's bundler, so
  the app stays fully offline and proxy-safe.
- These are variable fonts, so all needed weights (Inter 400–700, Fraunces
  400/600/900) come from one file each.

### 2. Token layer (`theme.css`)

**Typography tokens (revised):**

```css
--font-display: 'Fraunces Variable', Georgia, serif;  /* brand, titles, tiles, scores */
--font-main:    'Inter Variable', system-ui, sans-serif; /* default UI + body (was Georgia) */
--font-mono:    'Inter Variable', system-ui, sans-serif; /* point numerals (was Courier New) */
```

Redefining `--font-main` to Inter means every existing `font-family: var(--font-main)`
becomes clean sans automatically. `--font-display` is then applied *selectively*
to the brand wordmark, big titles, scoreboard numerals, and tile letters.

**Palette (enriched for the rich finish; deltas from current):**

| Token | Current | New | Why |
|-------|---------|-----|-----|
| `--color-tile` | `#d4ad4e` | `#e0bb55` | Brighter face for the glossy gradient |
| `--color-tile-hi` | *new* | `#f4d889` | Tile top-highlight gradient stop |
| `--color-tile-lo` | *new* | `#c79a36` | Tile bottom gradient stop |
| `--color-board` | `#342e18` | (retained as fallback) | Superseded by the rack/board gradient tokens below |
| `--color-board-panel-hi` | *new* | `#2a2a50` | Board surround gradient top |
| `--color-board-panel-lo` | *new* | `#1a1a32` | Board surround gradient bottom |
| `--color-cell` | `#22223a` | `#1c1c34` | Slightly deeper for inset wells |
| `--color-rack-hi` | *new* | `#2c2618` | Wood rack gradient top |
| `--color-rack-lo` | *new* | `#221d12` | Wood rack gradient bottom |
| `--color-gold` | `#d4ad4e` | `#e8c873` | Brighter for score numerals |
| premium dw/tw/tl/dl | flat | radial-gradient pairs | Beveled premium squares |

Premium-square gradient stops (radial, light center → dark edge):

```css
--prem-tw: radial-gradient(circle at 50% 32%, #e44545, #9e2424);
--prem-dw: radial-gradient(circle at 50% 32%, #bd4c66, #7e2d40);
--prem-tl: radial-gradient(circle at 50% 32%, #4f86d8, #2f5aa0);
--prem-dl: radial-gradient(circle at 50% 32%, #5fa3d8, #386f9e);
```

**Depth tokens (new):**

```css
--bevel-tile:  0 2px 4px rgba(0,0,0,.45),
               inset 0 1.5px 1px rgba(255,255,255,.65),
               inset 0 -1.5px 2px rgba(120,80,20,.5);
--bevel-cell:  inset 0 1.5px 4px rgba(0,0,0,.55);          /* empty cell well */
--bevel-prem:  inset 0 1px 2px rgba(255,255,255,.28),
               inset 0 -1px 2px rgba(0,0,0,.4);
--shadow-board: 0 12px 34px rgba(0,0,0,.6),
                inset 0 2px 1px rgba(255,255,255,.06),
                inset 0 -3px 8px rgba(0,0,0,.5);
--shadow-panel: 0 2px 8px rgba(0,0,0,.3),
                inset 0 1px 0 rgba(255,255,255,.04);
--btn-bevel:   0 3px 8px rgba(0,0,0,.4),
               inset 0 1.5px 1px rgba(255,255,255,.4),
               inset 0 -1.5px 2px rgba(40,70,10,.5);
```

**Background vignette (global.css):** deepen the existing radial gradient toward
the mockup — `radial-gradient(ellipse at 50% -5%, #20203e, #0e0e18 70%)`.

### 3. Component-by-component

**Header (`App.module.css`, small `App.tsx` touch).**
- Wordmark: `--font-display`, weight 900, gradient-gold text
  (`linear-gradient(180deg,#f6e3a6,#cfa23e)` clipped to text). Keep it a `Link`.
- Add an italic green tagline span ("grow your vocabulary") beside the wordmark,
  hidden under ~600px. This is the one real markup addition in `App.tsx`.
- Header bar: vertical gradient (`#1f1f38 → #181828`) + `--shadow-sm`.

**Login (`Login.module.css`).**
- Title in `--font-display`, weight 900. Keep the accent→gold top hairline.
- Card gets the panel gradient + `--shadow-lg`; inputs keep the inset shadow and
  gain the existing accent focus glow.
- Buttons adopt the shared button treatment below.

**Lobby (`Lobby.module.css`).**
- Cards: raised gradient surface, `--shadow-panel` at rest, lift on hover.
  "Your turn" cards keep the green border + accent-muted background.
- Leaderboard: row striping retained; top-3 rank numerals in `--font-display` +
  `--color-gold`; current-user row keeps the accent left-border + tinted bg.
- Stats numerals in `--font-display` gold for visual punch.

**Game board (`Board.module.css`).**
- Board surround: gradient (`--color-board-panel-hi → -lo`) + `--shadow-board`.
- Empty cells: `--color-cell` with `--bevel-cell` (recessed wells).
- Premium squares: the radial `--prem-*` gradients + `--bevel-prem`. Center star
  keeps the DW rose with a ★ glyph.
- Hover on empty cell: subtle accent glow (unchanged behavior).

**Tiles (`Tile.module.css`).**
- Face: `linear-gradient(160deg, var(--color-tile-hi), var(--color-tile) 45%, var(--color-tile-lo))`
  with `--bevel-tile`.
- Letter: `--font-display`, weight 600, `--color-tile-text`.
- Points: `--font-mono` (now Inter), bottom-right, small.
- States retained, restyled: `.selected` (blue glow + scale), `.tentative`
  (accent ring + pulse), `.lastMove` (green ring). Blank tiles use a pale
  ivory gradient.

**Rack (`Rack.module.css`).**
- Wooden gradient (`--color-rack-hi → -lo`) with inset shadow + bottom highlight,
  matching the mockup's tray feel.

**Scoreboard (`Game.module.css`).**
- Player panels: raised gradient + `--shadow-panel`. Active player: green border,
  accent glow, faint green-tinted gradient bg.
- Score numerals: `--font-display`, weight 900, `--color-gold`.

**Buttons (shared treatment, applied per module).**
Three variants, all with `--btn-bevel`:
- **Primary** ("Play Word", Sign In): green gradient (`#95d143 → #6fa028`),
  dark text, accent glow on hover.
- **Ghost** (Shuffle/Swap/Pass, header buttons, secondary): dark gradient
  (`#2a2a48 → #20203a`), light text, subtle hover lift.
- **Danger** (Resign, Delete Account): muted maroon gradient, vivid on hover.
- Disabled: desaturated, no lift (existing rule kept).

**Modals (`BlankTilePicker.module.css`, `ChangePasswordModal.module.css`).**
- Adopt the raised panel gradient, `--shadow-lg`, and the shared button + input
  treatments so they match the refreshed surfaces.

**Game-over panel (`Game.module.css`).**
- Raised panel + `--shadow-lg`. Title in `--font-display`. Victory = accent,
  defeat = danger, draw = muted (existing semantics kept).

### 4. Motion & micro-interactions

- Standardize transitions at `150ms ease`.
- Button hover `translateY(-1px)` + shadow/glow increase; card hover
  `translateY(-2px)`.
- Keep the tentative-tile pulse, but wrap **all** keyframe animations (pulse,
  any glow) in `@media (prefers-reduced-motion: no-preference)`, with a static
  fallback for reduced-motion users.

## Accessibility

- Verify AA contrast for: gold numerals on dark panels, tile text on the gold
  gradient, muted text on raised surfaces, and button text on gradients. Adjust
  the relevant token if any pair falls short.
- Keep the global `:focus-visible` outline (`2px solid var(--color-accent)`).
- Honor `prefers-reduced-motion` for every animation.

## Out of scope

- Light mode / theme switching.
- The botanical "Night Garden" and "Neon Pop" directions (rejected).
- Any game logic, board layout, routing, API, or DB change.
- New iconography or illustration beyond the existing ★ and text.

## Testing / verification

- `npm run lint` and `npm run build` in `packages/client` pass.
- Existing unit/component tests (`vitest`) and Playwright e2e specs pass
  unchanged — selectors are class-module based and markup is largely untouched.
- Manual visual check of Login, Lobby (incl. leaderboard), an in-progress Game
  (board, rack, scoreboard, buttons), both modals, and game-over — at desktop
  and ~375px mobile widths.
- Confirm fonts load with **no network requests to fonts.googleapis.com**
  (self-hosted), including under the `/word` base path.
