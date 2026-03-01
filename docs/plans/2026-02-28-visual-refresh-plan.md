# Visual Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate the existing dark theme with better depth, contrast, and visual hierarchy across all pages.

**Architecture:** CSS-only changes plus one React refactor (header). All work is in `packages/client/src/`. Update theme tokens first, then apply them outward from global → components → pages. No new dependencies.

**Tech Stack:** CSS custom properties, CSS Modules, React (one component refactor for header)

---

### Task 1: Update Design Tokens

**Files:**
- Modify: `packages/client/src/styles/theme.css:1-24`

**Step 1: Update theme.css with revised palette and new tokens**

Replace the entire contents of `theme.css` with:

```css
:root {
  /* Background & surfaces */
  --color-bg: #12121f;
  --color-surface: #1c1c32;
  --color-surface-raised: #252542;
  --color-surface-hover: #2e2e4d;

  /* Board */
  --color-board: #342e18;
  --color-cell: #22223a;
  --color-cell-hover: #2c2c48;

  /* Tiles */
  --color-tile: #d4ad4e;
  --color-tile-text: #12121f;

  /* Premium squares */
  --color-premium-dw: #9c3a50;
  --color-premium-tw: #cc3535;
  --color-premium-dl: #3a6a95;
  --color-premium-tl: #3868b8;

  /* Accent */
  --color-accent: #7fb836;
  --color-accent-muted: rgba(127, 184, 54, 0.12);
  --color-gold: #d4ad4e;

  /* Text */
  --color-text: #eae7df;
  --color-text-muted: #9898b0;
  --color-text-dim: #606078;

  /* Borders & inputs */
  --color-border: #3a3a55;
  --color-input-border: #4a4a65;

  /* Semantic */
  --color-danger: #d45858;
  --color-invite-bg: #1e2e1e;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 4px 20px rgba(0, 0, 0, 0.4);
  --shadow-glow-accent: 0 0 12px rgba(127, 184, 54, 0.2);

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Typography */
  --font-main: 'Georgia', serif;
  --font-mono: 'Courier New', monospace;
}
```

**Step 2: Verify the app still loads**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add packages/client/src/styles/theme.css
git commit -m "style: update design tokens with refined palette, shadows, and radii"
```

---

### Task 2: Update Global Styles & Body Background

**Files:**
- Modify: `packages/client/src/styles/global.css:1-38`

**Step 1: Update global.css**

Update the `body` rule to add the radial gradient background and standardize transitions. Update `button` and `input` rules too:

```css
@import './theme.css';

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-main);
  background: radial-gradient(ellipse at 50% 0%, #1a1a30 0%, var(--color-bg) 70%);
  background-attachment: fixed;
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  height: 100dvh;
  height: 100vh;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  font-family: var(--font-main);
  color: var(--color-text);
  font-style: italic;
}

button {
  font-family: var(--font-main);
  transition: all 150ms ease;
}

input {
  font-family: var(--font-main);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

**Step 2: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/client/src/styles/global.css
git commit -m "style: add radial gradient background and global focus/transition defaults"
```

---

### Task 3: Extract Header Into CSS Module

**Files:**
- Create: `packages/client/src/App.module.css`
- Modify: `packages/client/src/App.tsx:1-55`

**Step 1: Create App.module.css**

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
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: 50;
}

.headerBrand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.headerTitle {
  font-family: var(--font-main);
  font-size: 1.125rem;
  font-weight: bold;
  color: var(--color-accent);
  letter-spacing: 0.02em;
}

.headerUser {
  font-family: var(--font-main);
  font-weight: bold;
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
  color: var(--color-text);
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
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

**Step 2: Update App.tsx to use CSS module**

Replace the entire `App.tsx` with:

```tsx
import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';
import { Lobby } from './pages/Lobby.js';
import { Game } from './pages/Game.js';
import { ChangePasswordModal } from './components/ChangePasswordModal.js';
import styles from './App.module.css';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, loginWithPasskey, registerWithPasskey, logout, changePassword, deleteAccount, refreshUser } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} onLoginPasskey={loginWithPasskey} onRegisterPasskey={registerWithPasskey} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/'}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            <span className={styles.headerTitle}>Word Garden</span>
            <span className={styles.headerUser}>
              {user.username} ({Math.round(user.rating)})
            </span>
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => { if (confirm('Delete your account? This will permanently remove all your data and game history.')) deleteAccount(); }} className={styles.headerButtonDanger}>
              Delete Account
            </button>
            <button onClick={() => setShowPasswordModal(true)} className={styles.headerButton}>
              Change Password
            </button>
            <button onClick={logout} className={styles.headerButton}>
              Sign Out
            </button>
          </div>
        </header>
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<Lobby userId={user.id} username={user.username} rating={user.rating} onGameFinished={refreshUser} />} />
            <Route path="/game/:id" element={<Game onGameFinished={refreshUser} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
      {showPasswordModal && (
        <ChangePasswordModal
          onSubmit={changePassword}
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </BrowserRouter>
  );
}
```

**Step 3: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/App.module.css
git commit -m "style: extract header into CSS module with brand title and sticky positioning"
```

---

### Task 4: Refresh Login Page Styles

**Files:**
- Modify: `packages/client/src/pages/Login.module.css:1-117`

**Step 1: Update Login.module.css**

Replace the entire file with:

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 1rem;
}

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

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-gold));
}

.title {
  font-family: var(--font-main);
  color: var(--color-text);
  text-align: center;
  margin: 0 0 0.25rem;
  font-size: 2.25rem;
  letter-spacing: 0.02em;
}

.subtitle {
  text-align: center;
  color: var(--color-accent);
  margin: 0 0 2rem;
  font-style: italic;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input {
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-input-border);
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
}

.input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 3px var(--color-accent-muted);
}

.error {
  color: var(--color-danger);
  margin: 0;
  font-size: 0.875rem;
  text-align: center;
}

.buttons {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.primaryButton,
.secondaryButton {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  cursor: pointer;
  min-height: 44px;
}

.primaryButton {
  background: var(--color-accent);
  color: white;
  border: none;
  font-weight: bold;
  box-shadow: var(--shadow-sm);
}

.primaryButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

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

.primaryButton:disabled,
.secondaryButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  filter: none;
}

.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: var(--font-main);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}
```

**Step 2: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/client/src/pages/Login.module.css
git commit -m "style: refresh login page with depth, accent line, and better contrast"
```

---

### Task 5: Refresh Lobby Page Styles

**Files:**
- Modify: `packages/client/src/pages/Lobby.module.css:1-258`

**Step 1: Update Lobby.module.css**

Replace the entire file with:

```css
.lobby {
  max-width: 600px;
  margin: 0 auto;
  padding: 1.5rem;
}

.lobbyGrid {
  display: flex;
  flex-direction: column;
}

.sidePanel {
  min-width: 0;
}

.centerPanel {
  min-width: 0;
}

@media (min-width: 960px) {
  .lobby {
    max-width: 1100px;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-top: 0;
    padding-bottom: 2rem;
  }

  .lobbyGrid {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    gap: 2rem;
    align-items: start;
  }
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.actionButton,
.actionButtonCancel {
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  cursor: pointer;
  min-height: 44px;
  border: none;
  font-weight: bold;
  box-shadow: var(--shadow-sm);
}

.actionButton {
  background: var(--color-accent);
  color: #111;
}

.actionButton:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.actionButtonCancel {
  background: var(--color-danger);
  color: var(--color-text);
}

.actionButtonCancel:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.joinRow {
  display: flex;
  gap: 0.5rem;
}

.joinInput {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-input-border);
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
}

.joinInput:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 3px var(--color-accent-muted);
}

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

.joinButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  filter: none;
}

.joinInput::placeholder {
  color: var(--color-text-muted);
}

.inviteBox {
  background: var(--color-invite-bg);
  padding: 1rem;
  border-radius: var(--radius-md);
  text-align: center;
  margin-bottom: 1rem;
  font-family: var(--font-mono);
  border: 1px solid var(--color-border);
}

.copyButton {
  margin-left: 0.75rem;
  padding: 0.25rem 0.75rem;
  background: var(--color-accent);
  color: #111;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: bold;
}

.copyButton:hover {
  filter: brightness(1.1);
}

.error {
  color: var(--color-danger);
  text-align: center;
}

.searching {
  text-align: center;
  color: var(--color-accent);
  font-style: italic;
}

.sectionTitle {
  font-family: var(--font-main);
  color: var(--color-text);
  font-size: 1.125rem;
  font-weight: bold;
  margin: 2rem 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

@media (min-width: 960px) {
  .sidePanel .sectionTitle {
    margin-top: 0;
  }
}

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

.gameCard:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.cancelGameButton {
  padding: 0.25rem 0.75rem;
  background: transparent;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.875rem;
  font-family: var(--font-main);
}

.cancelGameButton:hover {
  background: var(--color-danger);
  color: #111;
}

.yourTurn {
  border-left: 4px solid var(--color-accent);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-sm);
  position: relative;
}

.yourTurn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-md);
  background: var(--color-accent-muted);
  pointer-events: none;
}

.gameInfo {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.opponent {
  font-weight: bold;
  color: var(--color-text);
}

.score {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.turnIndicator {
  font-size: 0.875rem;
  color: var(--color-accent);
  font-weight: bold;
}

.finished {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.leaderboard {
  margin-bottom: 1.5rem;
}

.leaderboardList {
  list-style: none;
  padding: 0;
  margin: 0;
}

.leaderboardEntry {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  gap: 0.75rem;
  transition: background 150ms ease;
}

.leaderboardEntry:nth-child(odd) {
  background: rgba(255, 255, 255, 0.03);
}

.leaderboardEntry:nth-child(even) {
  background: transparent;
}

.leaderboardSelf {
  background: rgba(127, 184, 54, 0.15) !important;
  font-weight: bold;
  border-left: 3px solid var(--color-accent);
}

.leaderboardRank {
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  min-width: 2rem;
}

.leaderboardRankTop {
  composes: leaderboardRank;
  color: var(--color-gold);
  font-weight: bold;
}

.leaderboardName {
  flex: 1;
  color: var(--color-text);
}

.leaderboardRating {
  font-family: var(--font-mono);
  color: var(--color-text);
  font-weight: bold;
}
```

**Step 2: Update Lobby.tsx to use leaderboardRankTop for top 3**

In `packages/client/src/pages/Lobby.tsx`, change line 148 from:

```tsx
                    <span className={styles.leaderboardRank}>#{entry.rank}</span>
```

to:

```tsx
                    <span className={entry.rank <= 3 ? styles.leaderboardRankTop : styles.leaderboardRank}>#{entry.rank}</span>
```

**Step 3: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/client/src/pages/Lobby.module.css packages/client/src/pages/Lobby.tsx
git commit -m "style: refresh lobby with elevated cards, better leaderboard, and hover effects"
```

---

### Task 6: Refresh Board & Cell Styles

**Files:**
- Modify: `packages/client/src/components/Board.module.css:1-62`

**Step 1: Update Board.module.css**

Replace the entire file with:

```css
.board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  grid-template-rows: repeat(15, 1fr);
  gap: 2px;
  background: var(--color-board);
  padding: 6px;
  border-radius: var(--radius-md);
  aspect-ratio: 1;
  height: min(100%, 90vw, 560px);
  max-width: min(90vw, 560px);
  margin: 0 auto;
  box-shadow: var(--shadow-lg);
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-cell);
  aspect-ratio: 1;
  cursor: pointer;
  border-radius: 2px;
  transition: background 150ms ease, box-shadow 150ms ease;
}

.cell:hover {
  background: var(--color-cell-hover);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.premiumDW {
  background: linear-gradient(135deg, var(--color-premium-dw), color-mix(in srgb, var(--color-premium-dw), black 15%));
}

.premiumTW {
  background: linear-gradient(135deg, var(--color-premium-tw), color-mix(in srgb, var(--color-premium-tw), black 15%));
}

.premiumDL {
  background: linear-gradient(135deg, var(--color-premium-dl), color-mix(in srgb, var(--color-premium-dl), black 15%));
}

.premiumTL {
  background: linear-gradient(135deg, var(--color-premium-tl), color-mix(in srgb, var(--color-premium-tl), black 15%));
}

.premiumLabel {
  font-size: clamp(0.35rem, 1.3vw, 0.6rem);
  font-weight: bold;
  color: rgba(255, 255, 255, 0.75);
  font-family: var(--font-mono);
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.lastMove {
  box-shadow: inset 0 0 0 2px rgba(127, 184, 54, 0.5);
}

.dropHover {
  background: rgba(127, 184, 54, 0.3) !important;
  box-shadow: inset 0 0 0 2px rgba(127, 184, 54, 0.6);
}
```

**Step 2: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/client/src/components/Board.module.css
git commit -m "style: refresh board with deeper shadow, wider gaps, and premium square gradients"
```

---

### Task 7: Refresh Tile Styles

**Files:**
- Modify: `packages/client/src/components/Tile.module.css:1-47`

**Step 1: Update Tile.module.css**

Replace the entire file with:

```css
.tile {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #dbb854 0%, var(--color-tile) 100%);
  border-radius: 3px;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  user-select: none;
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.tile:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-lg);
}

.selected {
  outline: 2px solid #60b0ff;
  outline-offset: 1px;
  transform: scale(1.15);
  box-shadow: 0 0 10px rgba(96, 176, 255, 0.6), var(--shadow-md);
}

.tentative {
  opacity: 0.85;
  box-shadow: 0 0 0 2px var(--color-accent);
  animation: tentativePulse 2s ease-in-out infinite;
}

@keyframes tentativePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

.letter {
  font-family: var(--font-main);
  font-weight: bold;
  font-size: clamp(0.6rem, 2.5vw, 1.25rem);
  color: var(--color-tile-text);
  line-height: 1;
}

.points {
  position: absolute;
  bottom: 1px;
  right: 2px;
  font-size: clamp(0.35rem, 1.2vw, 0.6rem);
  color: var(--color-tile-text);
  font-family: var(--font-mono);
  line-height: 1;
}
```

**Step 2: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/client/src/components/Tile.module.css
git commit -m "style: refresh tiles with wood gradient, tentative pulse, and better shadows"
```

---

### Task 8: Refresh Rack Styles

**Files:**
- Modify: `packages/client/src/components/Rack.module.css:1-46`

**Step 1: Update Rack.module.css**

Replace the entire file with:

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
  background: var(--color-board);
  padding: 6px;
  border-radius: var(--radius-md);
  touch-action: none;
  box-shadow: var(--shadow-md);
}

.rackSlot {
  width: clamp(36px, 8vw, 52px);
  height: clamp(36px, 8vw, 52px);
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
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  font-size: 0.875rem;
  cursor: pointer;
  color: var(--color-text);
  min-height: 44px;
}

.shuffleButton:hover {
  background: var(--color-surface-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
```

**Step 2: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/client/src/components/Rack.module.css
git commit -m "style: refresh rack with shadow depth and hover effects"
```

---

### Task 9: Refresh Game Page Styles

**Files:**
- Modify: `packages/client/src/pages/Game.module.css:1-178`

**Step 1: Update Game.module.css**

Replace the entire file with:

```css
.gamePage {
  max-width: 600px;
  margin: 0 auto;
  padding: 0.5rem 1.5rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.boardArea {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.backButton {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-family: var(--font-main);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.25rem 0;
  margin-bottom: 0.25rem;
}

.backButton:hover {
  color: var(--color-text);
}

.loading {
  text-align: center;
  padding: 2rem;
  color: var(--color-text);
}

.scoreboard {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  margin-bottom: 0.5rem;
}

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

.playerLabel {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.scoreValue {
  font-size: 1.5rem;
  font-weight: bold;
  font-family: var(--font-mono);
  color: var(--color-gold);
}

.gameStatus {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.yourTurn {
  color: var(--color-accent);
  font-weight: bold;
  font-size: 0.875rem;
}

.waiting {
  color: var(--color-text-muted);
  font-style: italic;
  font-size: 0.875rem;
}

.finished {
  color: var(--color-text);
  font-weight: bold;
  font-size: 0.875rem;
}

.tilesLeft {
  font-size: 0.7rem;
  color: var(--color-text-dim);
}

.error {
  color: var(--color-danger);
  text-align: center;
  margin: 0.5rem 0;
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.playButton {
  padding: 0.75rem 2rem;
  background: var(--color-accent);
  color: white;
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

.playButton:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: saturate(0.3);
  transform: none;
  box-shadow: none;
}

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

.secondaryAction:hover {
  background: var(--color-surface-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

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

.dangerAction:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: rgba(212, 88, 88, 0.1);
  transform: translateY(-1px);
}

.gameOverOverlay {
  text-align: center;
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: var(--color-surface-raised);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}

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

**Step 2: Update Game.tsx game-over heading to use result-specific colors**

In `packages/client/src/pages/Game.tsx`, change line 169 from:

```tsx
          <h2>{myScore > opponentScore ? 'You Won!' : myScore < opponentScore ? 'You Lost' : 'Draw'}</h2>
```

to:

```tsx
          <h2 style={{ color: myScore > opponentScore ? 'var(--color-accent)' : myScore < opponentScore ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
            {myScore > opponentScore ? 'You Won!' : myScore < opponentScore ? 'You Lost' : 'Draw'}
          </h2>
```

**Step 3: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/client/src/pages/Game.module.css packages/client/src/pages/Game.tsx
git commit -m "style: refresh game page with gold scores, accent glow, and muted resign button"
```

---

### Task 10: Refresh Modal Styles

**Files:**
- Modify: `packages/client/src/components/BlankTilePicker.module.css:1-63`
- Modify: `packages/client/src/components/ChangePasswordModal.module.css:1-93`

**Step 1: Update BlankTilePicker.module.css**

Replace the entire file with:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.picker {
  background: var(--color-surface-raised);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  max-width: 320px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}

.picker h3 {
  margin: 0 0 0.75rem;
  text-align: center;
  font-family: var(--font-main);
  color: var(--color-text);
  font-size: 1rem;
}

.letters {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.letterButton {
  aspect-ratio: 1;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  color: var(--color-text);
  min-height: 36px;
}

.letterButton:hover {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.cancelButton {
  display: block;
  margin: 0.75rem auto 0;
  padding: 0.5rem 1.5rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-main);
  cursor: pointer;
  color: var(--color-text-muted);
}

.cancelButton:hover {
  background: var(--color-surface-hover);
}
```

**Step 2: Update ChangePasswordModal.module.css**

Replace the entire file with:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal {
  background: var(--color-surface-raised);
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  max-width: 380px;
  width: 90%;
}

.title {
  font-family: var(--font-main);
  color: var(--color-text);
  margin: 0 0 1.5rem;
  font-size: 1.25rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input {
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-input-border);
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
}

.input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 3px var(--color-accent-muted);
}

.error {
  color: var(--color-danger);
  margin: 0;
  font-size: 0.875rem;
}

.success {
  color: var(--color-accent);
  margin: 0;
  font-size: 0.875rem;
}

.buttons {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.submitButton,
.cancelButton {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 1rem;
  font-family: var(--font-main);
  cursor: pointer;
  min-height: 44px;
}

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

.cancelButton {
  background: transparent;
  color: var(--color-text);
  border: 2px solid var(--color-border);
}

.cancelButton:hover {
  background: var(--color-surface-hover);
}

.submitButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  filter: none;
}
```

**Step 3: Verify build**

Run: `cd packages/client && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/client/src/components/BlankTilePicker.module.css packages/client/src/components/ChangePasswordModal.module.css
git commit -m "style: refresh modals with raised surfaces, borders, and consistent tokens"
```

---

### Task 11: Final Verification

**Step 1: Run full client build**

Run: `cd packages/client && npx vite build 2>&1`
Expected: Build succeeds with no warnings about missing CSS vars.

**Step 2: Run TypeScript check**

Run: `cd packages/client && npx tsc --noEmit 2>&1`
Expected: No errors.

**Step 3: Verify no leftover fallback values referencing old light theme**

Search for old fallback like `#2C1810` or `#F5E6D0` or `#f5f0e8`:
Run: `grep -r "#2C1810\|#F5E6D0\|#f5f0e8\|#8B7355\|#E8B4B8\|#B8D4E8\|#5B8CC7\|#DEB887" packages/client/src/ --include="*.css" --include="*.tsx"`

Expected: No matches (all old fallbacks replaced).

**Step 4: Commit any remaining cleanup**

If there are stale fallback values, remove them and commit:

```bash
git add -A packages/client/src/
git commit -m "style: remove stale fallback color values from CSS"
```
