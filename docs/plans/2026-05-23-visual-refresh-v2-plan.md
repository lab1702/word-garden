# Visual Refresh v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Word Garden a more appealing dark look — Fraunces + Inter typography, enriched indigo/gold/green palette, and tactile depth (beveled glossy tiles, inset board wells, gradient/glow buttons) — without changing any game behavior.

**Architecture:** Pure visual refresh driven by the existing token layer. Add two self-hosted variable fonts, extend `theme.css` custom properties (fonts, palette, gradients, bevels, shadows), then update each component's CSS Module to consume the new tokens. Only two tiny markup edits (a header tagline span; a `blank` class on `Tile`). No logic, routing, API, or DB changes.

**Tech Stack:** React 19 + TypeScript, Vite 6, CSS Modules, Vitest (jsdom) for unit tests, Playwright for e2e, `@fontsource-variable` for self-hosted fonts.

**Spec:** `docs/plans/2026-05-23-visual-refresh-v2-design.md`. Visual target of record: `.superpowers/brainstorm/<session>/content/full-preview.html` (gitignored).

---

## A note on testing for this plan

This is a CSS/visual refresh, so most tasks have **no meaningful unit test** — the verification is "type-checks, builds, and the existing test suite still passes," plus a manual visual check at the end. Two tasks touch `.tsx` markup; one of those (the `Tile` blank class) gets a real red→green unit test. Do not invent assertions on color values — they add no safety and are brittle. Be honest in commits about what was verified.

**Commands (run from repo root):**
- Type-check + build the client: `npm run build -w packages/client`
- Client unit tests: `npm run test -w packages/client`
- A single client test file: `npm run test -w packages/client -- <path-substring>`
- Dev server for manual visual check: `npm run dev:client` (then open the printed URL)

After each task: build the client, run client unit tests, then commit. Don't claim success without seeing the command output (superpowers:verification-before-completion).

---

## Task 1: Add and wire up the fonts

**Files:**
- Modify: `packages/client/package.json` (via npm install — adds deps + lockfile)
- Modify: `packages/client/src/main.tsx`
- Modify: `packages/client/src/styles/theme.css:52-54` (font tokens only)

- [ ] **Step 1: Install the self-hosted variable fonts**

Run (from repo root):

```bash
npm install @fontsource-variable/fraunces @fontsource-variable/inter -w packages/client
```

Expected: both packages added to `packages/client/package.json` `dependencies` and `package-lock.json` updated. These bundle woff2 locally (no Google Fonts hot-link), so the app stays offline/proxy-safe.

- [ ] **Step 2: Import the fonts at app entry**

Edit `packages/client/src/main.tsx` — add the two font imports above the global CSS import:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Point the font tokens at the new families**

In `packages/client/src/styles/theme.css`, replace the Typography block (currently lines 52–54):

```css
  /* Typography */
  --font-main: 'Georgia', serif;
  --font-mono: 'Courier New', monospace;
```

with:

```css
  /* Typography */
  --font-display: 'Fraunces Variable', Georgia, serif;
  --font-main: 'Inter Variable', system-ui, -apple-system, sans-serif;
  --font-mono: 'Inter Variable', system-ui, sans-serif;
```

This flips every existing `var(--font-main)` to Inter and every `var(--font-mono)` (tile points, codes) to Inter. `--font-display` (Fraunces) is applied selectively in later tasks.

- [ ] **Step 4: Build to confirm fonts resolve and nothing breaks**

Run: `npm run build -w packages/client`
Expected: build succeeds with no module-resolution errors for `@fontsource-variable/*`.

- [ ] **Step 5: Run client unit tests**

Run: `npm run test -w packages/client`
Expected: all existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/package.json package-lock.json packages/client/src/main.tsx packages/client/src/styles/theme.css
git commit -m "feat(ui): self-host Fraunces + Inter and switch font tokens"
```

---

## Task 2: Extend the token layer (palette, gradients, bevels) + background vignette

**Files:**
- Modify: `packages/client/src/styles/theme.css` (full replacement)
- Modify: `packages/client/src/styles/global.css:15` (body background)

- [ ] **Step 1: Replace `theme.css` with the extended token set**

Write `packages/client/src/styles/theme.css` with this complete content (keeps the font tokens from Task 1, adds new palette/gradient/bevel tokens, retains old `--color-premium-*` and `--color-board` as fallbacks):

```css
:root {
  /* Background & surfaces */
  --color-bg: #12121f;
  --color-surface: #1c1c32;
  --color-surface-raised: #252542;
  --color-surface-hover: #2e2e4d;
  --gradient-surface-raised: linear-gradient(180deg, #26264a, #1e1e38);
  --gradient-header: linear-gradient(180deg, #1f1f38, #181828);

  /* Board & rack */
  --color-board: #342e18; /* retained fallback; superseded by gradients below */
  --gradient-board: linear-gradient(180deg, #2a2a50, #1a1a32);
  --gradient-rack: linear-gradient(180deg, #2c2618, #221d12);
  --color-cell: #1c1c34;
  --color-cell-hover: #2c2c48;

  /* Tiles */
  --color-tile: #e0bb55;
  --color-tile-hi: #f4d889;
  --color-tile-lo: #c79a36;
  --color-tile-text: #1a1505;
  --gradient-tile: linear-gradient(160deg, var(--color-tile-hi) 0%, var(--color-tile) 45%, var(--color-tile-lo) 100%);
  --gradient-tile-blank: linear-gradient(160deg, #efe7d4, #cfc3a6);

  /* Premium squares (flat fallbacks + beveled gradients) */
  --color-premium-dw: #9c3a50;
  --color-premium-tw: #cc3535;
  --color-premium-dl: #3a6a95;
  --color-premium-tl: #3868b8;
  --prem-tw: radial-gradient(circle at 50% 32%, #e44545, #9e2424);
  --prem-dw: radial-gradient(circle at 50% 32%, #bd4c66, #7e2d40);
  --prem-tl: radial-gradient(circle at 50% 32%, #4f86d8, #2f5aa0);
  --prem-dl: radial-gradient(circle at 50% 32%, #5fa3d8, #386f9e);

  /* Accent */
  --color-accent: #8cc63f;
  --color-accent-muted: rgba(140, 198, 63, 0.12);
  --gradient-accent: linear-gradient(180deg, #95d143, #6fa028);
  --color-gold: #e8c873;

  /* Text */
  --color-text: #eae7df;
  --color-text-muted: #9898b0;
  --color-text-dim: #8585a0;

  /* Borders & inputs */
  --color-border: #3a3a55;
  --color-input-border: #4a4a65;

  /* Semantic */
  --color-danger: #e86464;
  --color-invite-bg: #1e2e1e;
  --gradient-ghost: linear-gradient(180deg, #2a2a48, #20203a);
  --gradient-danger: linear-gradient(180deg, #3a2222, #2a1818);

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.4);
  --shadow-glow-accent: 0 0 12px rgba(140, 198, 63, 0.3);
  --shadow-panel: 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  --shadow-board: 0 12px 34px rgba(0, 0, 0, 0.6), inset 0 2px 1px rgba(255, 255, 255, 0.06), inset 0 -3px 8px rgba(0, 0, 0, 0.5);

  /* Bevels */
  --bevel-tile: 0 2px 4px rgba(0, 0, 0, 0.45), inset 0 1.5px 1px rgba(255, 255, 255, 0.65), inset 0 -1.5px 2px rgba(120, 80, 20, 0.5);
  --bevel-cell: inset 0 1.5px 4px rgba(0, 0, 0, 0.55);
  --bevel-prem: inset 0 1px 2px rgba(255, 255, 255, 0.28), inset 0 -1px 2px rgba(0, 0, 0, 0.4);
  --bevel-button: 0 3px 8px rgba(0, 0, 0, 0.4), inset 0 1.5px 1px rgba(255, 255, 255, 0.4), inset 0 -1.5px 2px rgba(40, 70, 10, 0.5);

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Typography */
  --font-display: 'Fraunces Variable', Georgia, serif;
  --font-main: 'Inter Variable', system-ui, -apple-system, sans-serif;
  --font-mono: 'Inter Variable', system-ui, sans-serif;
}
```

- [ ] **Step 2: Deepen the background vignette**

In `packages/client/src/styles/global.css`, replace the `body` `background` line (line 15):

```css
  background: radial-gradient(ellipse at 50% 0%, #1a1a30 0%, var(--color-bg) 70%);
```

with:

```css
  background: radial-gradient(ellipse at 50% -5%, #20203e 0%, #0e0e18 70%);
```

- [ ] **Step 3: Build**

Run: `npm run build -w packages/client`
Expected: build succeeds.

- [ ] **Step 4: Run client unit tests**

Run: `npm run test -w packages/client`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/styles/theme.css packages/client/src/styles/global.css
git commit -m "feat(ui): extend token layer with gradients, bevels, enriched palette"
```

---

## Task 3: Tiles — glossy gradient + bevel + blank variant (with a unit test)

**Files:**
- Test: `packages/client/src/components/Tile.test.tsx` (create)
- Modify: `packages/client/src/components/Tile.tsx`
- Modify: `packages/client/src/components/Tile.module.css` (full replacement)

- [ ] **Step 1: Write the failing test for the blank-tile class**

Create `packages/client/src/components/Tile.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tile } from './Tile.js';

describe('Tile blank styling', () => {
  it('applies a blank class when isBlank is set', () => {
    const { container } = render(<Tile letter="A" points={0} isBlank />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/blank/);
  });

  it('does not apply the blank class for a normal tile', () => {
    const { container } = render(<Tile letter="A" points={1} />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toMatch(/blank/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w packages/client -- Tile.test`
Expected: FAIL — the first case fails because no `blank` class is applied yet.

- [ ] **Step 3: Apply the blank class in `Tile.tsx`**

In `packages/client/src/components/Tile.tsx`, change the `className` on the tile `div` (line 16) from:

```tsx
      className={`${styles.tile} ${selected ? styles.selected : ''} ${tentative ? styles.tentative : ''} ${lastMove ? styles.lastMove : ''}`}
```

to:

```tsx
      className={`${styles.tile} ${isBlank ? styles.blank : ''} ${selected ? styles.selected : ''} ${tentative ? styles.tentative : ''} ${lastMove ? styles.lastMove : ''}`}
```

- [ ] **Step 4: Replace `Tile.module.css` with the tactile version (adds `.blank`)**

Write `packages/client/src/components/Tile.module.css`:

```css
.tile {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--gradient-tile);
  border-radius: 3px;
  box-shadow: var(--bevel-tile);
  cursor: pointer;
  user-select: none;
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.tile:hover {
  transform: scale(1.05);
  box-shadow: var(--bevel-tile), var(--shadow-lg);
}

.blank {
  background: var(--gradient-tile-blank);
}

.selected {
  outline: 2px solid #60b0ff;
  outline-offset: 1px;
  transform: scale(1.15);
  box-shadow: 0 0 10px rgba(96, 176, 255, 0.6), var(--bevel-tile);
  z-index: 2;
}

.tentative {
  opacity: 0.92;
  box-shadow: 0 0 0 2px var(--color-accent), var(--bevel-tile);
  animation: tentativePulse 2s ease-in-out infinite;
}

@keyframes tentativePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

.lastMove {
  outline: 2px solid rgba(140, 198, 63, 0.85);
  outline-offset: -1px;
  box-shadow: 0 0 8px rgba(140, 198, 63, 0.5), var(--bevel-tile);
}

.letter {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(0.6rem, 2.5vw, 1.75rem);
  color: var(--color-tile-text);
  line-height: 1;
}

.points {
  position: absolute;
  bottom: 2px;
  right: 3px;
  font-size: clamp(0.45rem, 1.5vw, 0.85rem);
  font-weight: 700;
  color: var(--color-tile-text);
  font-family: var(--font-mono);
  line-height: 1;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -w packages/client -- Tile.test`
Expected: PASS (both cases).

- [ ] **Step 6: Build and run the full client test suite**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/Tile.tsx packages/client/src/components/Tile.module.css packages/client/src/components/Tile.test.tsx
git commit -m "feat(ui): glossy beveled tiles + ivory blank variant"
```

---

## Task 4: Board & premium squares — inset wells + beveled gradients

**Files:**
- Modify: `packages/client/src/components/Board.module.css` (full replacement)

- [ ] **Step 1: Replace `Board.module.css`**

Write `packages/client/src/components/Board.module.css`:

```css
.board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  grid-template-rows: repeat(15, 1fr);
  gap: 2px;
  background: var(--gradient-board);
  padding: 7px;
  border-radius: var(--radius-md);
  aspect-ratio: 1;
  height: min(100%, 90vw);
  max-width: 90vw;
  margin: 0 auto;
  box-shadow: var(--shadow-board);
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-cell);
  aspect-ratio: 1;
  cursor: pointer;
  border-radius: 2px;
  box-shadow: var(--bevel-cell);
  transition: background 150ms ease, box-shadow 150ms ease;
}

.cell:hover {
  background: var(--color-cell-hover);
  box-shadow: var(--bevel-cell), inset 0 0 0 1px rgba(255, 255, 255, 0.08), var(--shadow-glow-accent);
}

.premiumDW {
  background: var(--prem-dw);
  box-shadow: var(--bevel-prem);
}

.premiumTW {
  background: var(--prem-tw);
  box-shadow: var(--bevel-prem);
}

.premiumDL {
  background: var(--prem-dl);
  box-shadow: var(--bevel-prem);
}

.premiumTL {
  background: var(--prem-tl);
  box-shadow: var(--bevel-prem);
}

.premiumLabel {
  font-size: clamp(0.35rem, 1.3vw, 0.75rem);
  font-weight: bold;
  color: rgba(255, 255, 255, 0.95);
  font-family: var(--font-mono);
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.dropHover {
  background: rgba(127, 184, 54, 0.3) !important;
  box-shadow: inset 0 0 0 2px rgba(127, 184, 54, 0.6) !important;
}
```

(Note: `dropHover` gets `!important` on `box-shadow` too, so the drop indicator wins over `.bevel-prem` on premium cells.)

- [ ] **Step 2: Build**

Run: `npm run build -w packages/client`
Expected: build succeeds.

- [ ] **Step 3: Run client unit tests**

Run: `npm run test -w packages/client`
Expected: all PASS (board has e2e coverage; unit suite unaffected).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/Board.module.css
git commit -m "feat(ui): inset board wells and beveled premium squares"
```

---

## Task 5: Rack — wooden tray

**Files:**
- Modify: `packages/client/src/components/Rack.module.css` (full replacement)

- [ ] **Step 1: Replace `Rack.module.css`**

Write `packages/client/src/components/Rack.module.css`:

```css
.rackContainer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.rack {
  display: flex;
  gap: 4px;
  background: var(--gradient-rack);
  padding: 7px;
  border-radius: var(--radius-md);
  touch-action: none;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5), inset 0 2px 3px rgba(0, 0, 0, 0.5), inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}

.rackSlot {
  width: clamp(36px, 8vw, 72px);
  height: clamp(36px, 8vw, 72px);
}

.lifting {
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}

.rackDropTarget {
  outline: 2px dashed var(--color-accent);
  outline-offset: 2px;
}

.shuffleButton {
  padding: 0.5rem 1.5rem;
  background: var(--gradient-ghost);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  font-size: 0.875rem;
  cursor: pointer;
  color: var(--color-text);
  min-height: 44px;
  box-shadow: var(--shadow-sm);
}

.shuffleButton:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

- [ ] **Step 2: Build + test**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/Rack.module.css
git commit -m "feat(ui): wooden rack tray"
```

---

## Task 6: Header — gradient-gold wordmark + tagline

**Files:**
- Modify: `packages/client/src/App.tsx:24-29` (add tagline span)
- Modify: `packages/client/src/App.module.css` (full replacement)

- [ ] **Step 1: Add the tagline span in `App.tsx`**

In `packages/client/src/App.tsx`, replace the `headerBrand` block (currently lines 24–29):

```tsx
          <div className={styles.headerBrand}>
            <Link to="/" className={styles.headerTitle}>Word Garden</Link>
            <span className={styles.headerUser}>
              {user.username} ({Math.round(user.rating)})
            </span>
          </div>
```

with:

```tsx
          <div className={styles.headerBrand}>
            <Link to="/" className={styles.headerTitle}>Word Garden</Link>
            <span className={styles.headerTagline}>grow your vocabulary</span>
            <span className={styles.headerUser}>
              {user.username} ({Math.round(user.rating)})
            </span>
          </div>
```

- [ ] **Step 2: Replace `App.module.css`**

Write `packages/client/src/App.module.css`:

```css
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: var(--gradient-header);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: 50;
}

.headerBrand {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.headerTitle {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: -0.01em;
  background: linear-gradient(180deg, #f6e3a6, #cfa23e);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-decoration: none;
  cursor: pointer;
}

.headerTitle:hover {
  opacity: 0.85;
}

.headerTagline {
  font-family: var(--font-main);
  font-style: italic;
  font-size: 0.8125rem;
  color: var(--color-accent);
}

.headerUser {
  font-family: var(--font-main);
  font-weight: 600;
  color: var(--color-text);
}

.headerActions {
  display: flex;
  gap: 0.5rem;
}

.headerButton {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text);
  font-size: 0.875rem;
}

.headerButton:hover {
  background: var(--color-surface-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.headerButtonDanger {
  composes: headerButton;
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.headerButtonDanger:hover {
  background: var(--color-danger);
  color: #111;
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
}

@media (max-width: 700px) {
  .headerTagline {
    display: none;
  }
}

@media (max-width: 600px) {
  .header {
    padding: 0.5rem 1rem;
  }

  .headerTitle {
    display: none;
  }

  .headerButton {
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
  }
}
```

- [ ] **Step 3: Build + test**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/App.module.css
git commit -m "feat(ui): gradient-gold wordmark and tagline in header"
```

---

## Task 7: Game page — scoreboard panels, buttons, game-over

**Files:**
- Modify: `packages/client/src/pages/Game.module.css` (targeted rule replacements)

- [ ] **Step 1: Raised scoreboard panels + active glow**

In `packages/client/src/pages/Game.module.css`, replace the `.playerScore` and `.activePlayer` rules (lines 48–59):

```css
.playerScore {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  transition: background 150ms ease;
}

.activePlayer {
  background: var(--color-accent-muted);
}
```

with:

```css
.playerScore {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  background: var(--gradient-surface-raised);
  border: 1px solid #2c2c4a;
  box-shadow: var(--shadow-panel);
  transition: background 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}

.activePlayer {
  background: linear-gradient(180deg, #2a3320, #222a18);
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px rgba(140, 198, 63, 0.4), var(--shadow-glow-accent), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
```

- [ ] **Step 2: Display-serif score numerals**

Replace the `.scoreValue` rule (lines 67–72):

```css
.scoreValue {
  font-size: 1.5rem;
  font-weight: bold;
  font-family: var(--font-mono);
  color: var(--color-gold);
}
```

with:

```css
.scoreValue {
  font-size: 1.6rem;
  font-weight: 900;
  font-family: var(--font-display);
  color: var(--color-gold);
}
```

- [ ] **Step 3: Primary "Play Word" button**

Replace the `.playButton` and `.playButton:hover` rules (lines 130–148):

```css
.playButton {
  padding: 0.75rem 2rem;
  background: var(--color-accent);
  color: #111;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  min-height: 44px;
  box-shadow: var(--shadow-sm);
}

.playButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow-accent);
}
```

with:

```css
.playButton {
  padding: 0.75rem 2rem;
  background: var(--gradient-accent);
  color: #10210a;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
  box-shadow: var(--bevel-button);
}

.playButton:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: var(--bevel-button), var(--shadow-glow-accent);
}
```

- [ ] **Step 4: Ghost secondary actions (Pass / Swap)**

Replace the `.secondaryAction` and `.secondaryAction:hover:not(:disabled)` rules (lines 158–173):

```css
.secondaryAction {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  cursor: pointer;
  color: var(--color-text);
  min-height: 44px;
}

.secondaryAction:hover:not(:disabled) {
  background: var(--color-surface-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
```

with:

```css
.secondaryAction {
  padding: 0.75rem 1.5rem;
  background: var(--gradient-ghost);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  cursor: pointer;
  color: var(--color-text);
  min-height: 44px;
  box-shadow: var(--shadow-sm);
}

.secondaryAction:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

- [ ] **Step 5: Danger "Resign" action → filled maroon gradient**

Replace the `.dangerAction` and `.dangerAction:hover:not(:disabled)` rules (lines 180–196):

```css
.dangerAction {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--color-danger), transparent 40%);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  cursor: pointer;
  color: color-mix(in srgb, var(--color-danger), var(--color-text-muted) 30%);
  min-height: 44px;
}

.dangerAction:hover:not(:disabled) {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: rgba(212, 88, 88, 0.1);
  transform: translateY(-1px);
}
```

with:

```css
.dangerAction {
  padding: 0.75rem 1.5rem;
  background: var(--gradient-danger);
  border: 1px solid color-mix(in srgb, var(--color-danger), transparent 55%);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  cursor: pointer;
  color: #f0c9c9;
  min-height: 44px;
  box-shadow: var(--shadow-sm);
}

.dangerAction:hover:not(:disabled) {
  border-color: var(--color-danger);
  background: linear-gradient(180deg, #5a2a2a, #3a1e1e);
  color: #fff;
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

- [ ] **Step 6: Display-serif game-over title + score**

Replace the `.gameOverOverlay h2` and `.gameOverOverlay p` rules (lines 213–224):

```css
.gameOverOverlay h2 {
  font-family: var(--font-main);
  color: var(--color-text);
  margin: 0 0 0.5rem;
}

.gameOverOverlay p {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  color: var(--color-gold);
  margin: 0 0 1rem;
}
```

with:

```css
.gameOverOverlay h2 {
  font-family: var(--font-display);
  font-weight: 900;
  color: var(--color-text);
  margin: 0 0 0.5rem;
}

.gameOverOverlay p {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1.6rem;
  color: var(--color-gold);
  margin: 0 0 1rem;
}
```

- [ ] **Step 7: Build + test**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/Game.module.css
git commit -m "feat(ui): refresh scoreboard, action buttons, and game-over panel"
```

---

## Task 8: Login page

**Files:**
- Modify: `packages/client/src/pages/Login.module.css` (targeted rule replacements)

- [ ] **Step 1: Raised card + display title**

In `packages/client/src/pages/Login.module.css`, replace the `.card` rule (lines 9–19):

```css
.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  max-width: 400px;
  width: 100%;
  position: relative;
  overflow: hidden;
}
```

with:

```css
.card {
  background: var(--gradient-surface-raised);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  max-width: 400px;
  width: 100%;
  position: relative;
  overflow: hidden;
}
```

Then replace the `.title` rule (lines 31–38):

```css
.title {
  font-family: var(--font-main);
  color: var(--color-text);
  text-align: center;
  margin: 0 0 0.25rem;
  font-size: 2.25rem;
  letter-spacing: 0.02em;
}
```

with:

```css
.title {
  font-family: var(--font-display);
  font-weight: 900;
  color: var(--color-text);
  text-align: center;
  margin: 0 0 0.25rem;
  font-size: 2.4rem;
  letter-spacing: -0.01em;
}
```

- [ ] **Step 2: Primary + secondary buttons**

Replace the `.primaryButton` and `.primaryButton:hover` rules (lines 94–106):

```css
.primaryButton {
  background: var(--color-accent);
  color: #111;
  border: none;
  font-weight: bold;
  box-shadow: var(--shadow-sm);
}

.primaryButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

with:

```css
.primaryButton {
  background: var(--gradient-accent);
  color: #10210a;
  border: none;
  font-weight: 700;
  box-shadow: var(--bevel-button);
}

.primaryButton:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: var(--bevel-button), var(--shadow-glow-accent);
}
```

Then replace the `.secondaryButton` and `.secondaryButton:hover` rules (lines 108–118):

```css
.secondaryButton {
  background: transparent;
  color: var(--color-text);
  border: 2px solid var(--color-border);
}

.secondaryButton:hover {
  background: var(--color-surface-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
```

with:

```css
.secondaryButton {
  background: var(--gradient-ghost);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.secondaryButton:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 3: Build + test**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; the Login double-submit test still PASSES (markup unchanged).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/pages/Login.module.css
git commit -m "feat(ui): refresh login card, title, and buttons"
```

---

## Task 9: Lobby page — cards, leaderboard, stats, buttons

**Files:**
- Modify: `packages/client/src/pages/Lobby.module.css` (targeted rule replacements)

- [ ] **Step 1: Primary action buttons → gradient + bevel**

In `packages/client/src/pages/Lobby.module.css`, replace the `.actionButton` and `.actionButton:hover` rules (lines 58–67):

```css
.actionButton {
  background: var(--color-accent);
  color: #111;
}

.actionButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

with:

```css
.actionButton {
  background: var(--gradient-accent);
  color: #10210a;
  box-shadow: var(--bevel-button);
}

.actionButton:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: var(--bevel-button), var(--shadow-glow-accent);
}
```

- [ ] **Step 2: Join button → gradient**

Replace the `.joinButton` and `.joinButton:hover` rules (lines 104–121):

```css
.joinButton {
  padding: 0.75rem 1.5rem;
  background: var(--color-accent);
  color: #111;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  font-weight: bold;
  cursor: pointer;
  min-height: 44px;
  box-shadow: var(--shadow-sm);
}

.joinButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

with:

```css
.joinButton {
  padding: 0.75rem 1.5rem;
  background: var(--gradient-accent);
  color: #10210a;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
  box-shadow: var(--bevel-button);
}

.joinButton:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: var(--bevel-button), var(--shadow-glow-accent);
}
```

- [ ] **Step 3: Game cards → raised gradient surface**

Replace the `.gameCard` rule (lines 188–199):

```css
.gameCard {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--color-surface-raised);
  border-radius: var(--radius-md);
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: var(--shadow-sm);
}
```

with:

```css
.gameCard {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--gradient-surface-raised);
  border: 1px solid #2c2c4a;
  border-radius: var(--radius-md);
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: var(--shadow-panel);
}
```

- [ ] **Step 4: Top-3 leaderboard ranks → display serif gold**

Replace the `.leaderboardRankTop` rule (lines 325–329):

```css
.leaderboardRankTop {
  composes: leaderboardRank;
  color: var(--color-gold);
  font-weight: bold;
}
```

with:

```css
.leaderboardRankTop {
  composes: leaderboardRank;
  font-family: var(--font-display);
  color: var(--color-gold);
  font-weight: 900;
}
```

- [ ] **Step 5: Community stat numerals → display serif gold**

Replace the `.statValue` rule (lines 353–358):

```css
.statValue {
  font-family: var(--font-mono);
  font-weight: bold;
  font-size: 1.125rem;
  color: var(--color-accent);
}
```

with:

```css
.statValue {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1.25rem;
  color: var(--color-gold);
}
```

- [ ] **Step 6: Build + test**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/pages/Lobby.module.css
git commit -m "feat(ui): refresh lobby cards, leaderboard, and stats"
```

---

## Task 10: Modals — BlankTilePicker & ChangePasswordModal

**Files:**
- Modify: `packages/client/src/components/BlankTilePicker.module.css` (targeted)
- Modify: `packages/client/src/components/ChangePasswordModal.module.css` (targeted)

- [ ] **Step 1: BlankTilePicker raised panel**

In `packages/client/src/components/BlankTilePicker.module.css`, replace the `.picker` rule (lines 11–19):

```css
.picker {
  background: var(--color-surface-raised);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  max-width: 320px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}
```

with:

```css
.picker {
  background: var(--gradient-surface-raised);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  max-width: 320px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}
```

- [ ] **Step 2: ChangePasswordModal raised panel + display title**

In `packages/client/src/components/ChangePasswordModal.module.css`, replace the `.modal` rule (lines 11–19):

```css
.modal {
  background: var(--color-surface-raised);
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  max-width: 380px;
  width: 90%;
}
```

with:

```css
.modal {
  background: var(--gradient-surface-raised);
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  max-width: 380px;
  width: 90%;
}
```

Then replace the `.title` rule (lines 21–26):

```css
.title {
  font-family: var(--font-main);
  color: var(--color-text);
  margin: 0 0 1.5rem;
  font-size: 1.25rem;
}
```

with:

```css
.title {
  font-family: var(--font-display);
  font-weight: 900;
  color: var(--color-text);
  margin: 0 0 1.5rem;
  font-size: 1.4rem;
}
```

Then replace the `.submitButton` and `.submitButton:hover` rules (lines 80–92):

```css
.submitButton {
  background: var(--color-accent);
  color: #111;
  border: none;
  font-weight: bold;
  box-shadow: var(--shadow-sm);
}

.submitButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

with:

```css
.submitButton {
  background: var(--gradient-accent);
  color: #10210a;
  border: none;
  font-weight: 700;
  box-shadow: var(--bevel-button);
}

.submitButton:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow: var(--bevel-button), var(--shadow-glow-accent);
}
```

- [ ] **Step 3: Build + test**

Run: `npm run build -w packages/client && npm run test -w packages/client`
Expected: build succeeds; tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/BlankTilePicker.module.css packages/client/src/components/ChangePasswordModal.module.css
git commit -m "feat(ui): refresh modal panels and buttons"
```

---

## Task 11: Motion safety + final verification

**Files:**
- Modify: `packages/client/src/styles/global.css` (append reduced-motion guard)

- [ ] **Step 1: Add a `prefers-reduced-motion` guard**

Append to `packages/client/src/styles/global.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This neutralizes the tentative-tile pulse and all hover transitions for users who request reduced motion, satisfying the spec's motion-accessibility requirement.

- [ ] **Step 2: Full build**

Run: `npm run build -w packages/client`
Expected: build succeeds.

- [ ] **Step 3: Full client unit test suite**

Run: `npm run test -w packages/client`
Expected: all PASS.

- [ ] **Step 4: Manual visual verification (dev server)**

Run: `npm run dev:client` and open the printed URL. Walk through and confirm against `full-preview.html`:
- **Login** — gradient-gold-adjacent serif title, raised card, gradient primary buttons.
- **Lobby** — raised game cards, top-3 leaderboard ranks in gold serif, gold serif stat numerals, gradient action/join buttons.
- **Game** — board with inset wells + beveled premium squares; glossy beveled tiles (place a blank to confirm the ivory variant); wooden rack; raised scoreboard with the active player glowing green and gold serif scores; gradient "Play Word", ghost Pass/Swap, maroon Resign; game-over panel with serif title.
- **Header** — gradient-gold "Word Garden" wordmark + green italic tagline (tagline hides under 700px; wordmark hides under 600px).
- **Modals** — open Change Password and the blank-tile picker; confirm raised panels and refreshed buttons.
- **Responsive** — repeat at ~375px width.

- [ ] **Step 5: Confirm fonts are self-hosted (no Google requests)**

In the browser devtools Network tab (filter: Font), reload and confirm font files are served from the app origin and there are **no requests to `fonts.googleapis.com` or `fonts.gstatic.com`**. Verify once more under the `/word` base path if available (`VITE_BASE_PATH=/word npm run build -w packages/client && npm run preview -w packages/client`).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/styles/global.css
git commit -m "feat(ui): honor prefers-reduced-motion"
```

- [ ] **Step 7: Optional — run e2e smoke**

If a local DB/server is available, run: `npm run test:e2e -w packages/client`
Expected: auth + game specs PASS (selectors are class-module/role based and markup is essentially unchanged). If the environment can't run e2e, note that it was skipped.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Fonts bundled/self-hosted → Task 1. Token layer (palette/gradients/bevels) → Task 2. Vignette → Task 2.
- Tiles (gloss/bevel/blank, display letters, Inter points) → Task 3. Board wells + premium gradients → Task 4. Rack → Task 5.
- Header wordmark + tagline → Task 6. Scoreboard/buttons/game-over → Task 7. Login → Task 8. Lobby cards/leaderboard/stats → Task 9. Modals → Task 10.
- Motion accessibility (`prefers-reduced-motion`) → Task 11. Contrast/offline checks → Task 11 manual steps.
- Out-of-scope items (light mode, other directions, logic changes) are not implemented. ✓

**Placeholder scan:** No TBD/TODO; every CSS/markup change shows complete code. ✓

**Type/name consistency:** New tokens (`--font-display`, `--gradient-*`, `--bevel-*`, `--prem-*`, `--shadow-panel`, `--shadow-board`) are defined in Task 2 before any task consumes them. `.blank` is defined in `Tile.module.css` (Task 3 Step 4) and the test asserts the substring `blank`, which matches the hashed CSS-module class. Button text color `#10210a` is used consistently across primary buttons. ✓
