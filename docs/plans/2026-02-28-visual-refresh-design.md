# Visual Refresh Design

Dark theme elevated: better depth, contrast, and hierarchy. Inspired by Chess.com/Lichess — clean, functional, layered surfaces. System fonts (Georgia, Courier New) retained.

## Design Tokens

### Revised Palette

| Token | Before | After | Notes |
|-------|--------|-------|-------|
| `--color-bg` | `#1a1a2e` | `#12121f` | Deeper for contrast headroom |
| `--color-surface` | `#252540` | `#1c1c32` | Clearer separation from bg |
| `--color-surface-raised` | *new* | `#252542` | Elevated cards/panels |
| `--color-surface-hover` | `#2e2e4a` | `#2e2e4d` | Minor adjustment |
| `--color-board` | `#3a3520` | `#342e18` | Richer dark wood |
| `--color-cell` | `#2a2a40` | `#22223a` | Darker = better tile contrast |
| `--color-cell-hover` | `#33334d` | `#2c2c48` | Adjusted for new cell base |
| `--color-tile` | `#c4a35a` | `#d4ad4e` | Warmer, brighter gold |
| `--color-accent` | `#7aab30` | `#7fb836` | Slightly brighter green |
| `--color-accent-muted` | *new* | `rgba(127, 184, 54, 0.12)` | Subtle accent backgrounds |
| `--color-gold` | *new* | `#d4ad4e` | Secondary accent for scores |
| `--color-text` | `#e0ddd5` | `#eae7df` | Better contrast |
| `--color-text-muted` | `#a0a0b8` | `#9898b0` | Slightly warmer |
| `--color-danger` | `#c75b5b` | `#d45858` | Punchier red |
| `--color-premium-dw` | `#8c3a4d` | `#9c3a50` | Richer rose |
| `--color-premium-tw` | `#b83838` | `#cc3535` | More vivid |
| `--color-premium-dl` | `#355f85` | `#3a6a95` | Brighter steel blue |
| `--color-premium-tl` | `#3562a8` | `#3868b8` | Brighter cobalt |

### New Tokens

```css
/* Shadows */
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.35);
--shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.4);
--shadow-glow-accent: 0 0 12px rgba(127, 184, 54, 0.2);

/* Radii */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
```

## Global Layout & Header

**Body background:** Subtle radial gradient `radial-gradient(ellipse at 50% 0%, #1a1a30 0%, var(--color-bg) 70%)`.

**Header:** Move from inline styles to CSS module. Add "Word Garden" brand title on left alongside username. Sticky positioning with `--shadow-sm`. Background: `var(--color-surface)`. On mobile: collapse account actions into smaller buttons or overflow menu.

**Page content:** Consistent `padding: 1.5rem`. Smooth scroll behavior.

## Login Page

- Card: `--shadow-lg`, `1px solid var(--color-border)`, 2px accent gradient line at top
- Title: `2.25rem`, `letter-spacing: 0.02em`
- Inputs: inner shadow (`inset 0 1px 3px rgba(0,0,0,0.2)`), focus glow (`0 0 0 3px var(--color-accent-muted)`)
- Button gap: `1rem`. Primary buttons get `--shadow-sm` and hover brightening

## Lobby Page

**Cards:** `--color-surface-raised` background, `--shadow-sm` rest, `--shadow-md` hover. "Your turn" cards: green border + `--color-accent-muted` background. Card margins: `0.75rem`.

**Section titles:** Remove `border-bottom`, use bold style + muted divider with more spacing below. Section gaps: `2rem`.

**Leaderboard:** Better row striping. Top 3 ranks use `--color-gold`. Current user row: brighter accent bg + left border.

**Actions:** Filled green buttons with `--shadow-sm`. Hover: brightness increase + shadow lift.

## Game Page

**Board:** Padding `6px`, cell gap `2px`, `--shadow-lg`. Premium squares: subtle inner gradient. Empty cell hover: subtle glow.

**Tiles:** Top-to-bottom gradient for 3D wood feel. Selected: tighter blue glow. Tentative: subtle pulse animation. Stronger `--shadow-md`.

**Rack:** Padding `6px`, `--shadow-md`.

**Scoreboard:** Active player: `--color-accent-muted` bg. Score values: `--color-gold`. Better tiles-remaining visibility.

**Buttons:** "Play Word": `--shadow-sm`, hover glow (`--shadow-glow-accent`). Disabled: desaturated. Resign: muted at rest, vivid on hover.

**Game over:** `--shadow-lg`. Victory: accent, defeat: danger, draw: muted.

## Micro-interactions

- Standardize transitions to `150ms ease`
- Button hover: `translateY(-1px)` + shadow increase
- Card hover: `translateY(-2px)` + shadow increase
- Focus-visible: `2px solid var(--color-accent)` with `offset 2px`
- No page transition animations (keep snappy)
