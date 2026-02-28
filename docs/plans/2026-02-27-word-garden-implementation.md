# Word Garden Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web-based Scrabble-style word game with garden theming, passkey auth, Glicko-2 matchmaking, and async turn-based gameplay.

**Architecture:** Monolithic SPA + REST API. React frontend communicates with an Express backend over REST. SSE for push notifications. PostgreSQL for persistence. Docker Compose for deployment (app + db containers), external Caddy for TLS.

**Tech Stack:** TypeScript, React, Vite, Express, PostgreSQL, node-postgres, @simplewebauthn/server+browser, bcrypt, Vitest, Playwright

**Design doc:** `docs/plans/2026-02-27-word-garden-design.md`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`
- Create: `.gitignore`

**Step 1: Create root workspace**

```json
// package.json
{
  "name": "word-garden",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:server": "npm run dev -w packages/server",
    "dev:client": "npm run dev -w packages/client",
    "build": "npm run build -w packages/shared && npm run build -w packages/client && npm run build -w packages/server",
    "test": "npm run test -w packages/server",
    "test:e2e": "npm run test:e2e -w packages/client"
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

```gitignore
// .gitignore
node_modules/
dist/
.env
*.local
```

**Step 2: Create shared package**

```json
// packages/shared/package.json
{
  "name": "@word-garden/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

```ts
// packages/shared/src/index.ts
export {};
```

**Step 3: Create server package**

```json
// packages/server/package.json
{
  "name": "@word-garden/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@word-garden/shared": "*",
    "express": "^5.1.0",
    "pg": "^8.13.0",
    "cors": "^2.8.5",
    "cookie-parser": "^1.4.7"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/pg": "^8.11.0",
    "@types/cors": "^2.8.17",
    "@types/cookie-parser": "^1.4.7",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

```json
// packages/server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

```ts
// packages/server/src/index.ts
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Word Garden server running on port ${PORT}`);
});
```

**Step 4: Create client package**

```json
// packages/client/package.json
{
  "name": "@word-garden/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@word-garden/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

```json
// packages/client/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

```ts
// packages/client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
    },
  },
});
```

```html
<!-- packages/client/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Word Garden</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// packages/client/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```tsx
// packages/client/src/App.tsx
export function App() {
  return <h1>Word Garden</h1>;
}
```

**Step 5: Install dependencies and verify**

Run: `npm install`
Expected: Successful install, node_modules created

Run: `npm run build -w packages/shared`
Expected: Builds without errors

Run: `npm run dev:server &` then `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with shared, server, and client packages"
```

---

### Task 2: Shared Types and Constants

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/tiles.ts`
- Create: `packages/shared/src/board.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Define core types**

```ts
// packages/shared/src/types.ts

export interface Tile {
  letter: string; // A-Z or '' for blank
  points: number;
}

export interface PlacedTile extends Tile {
  row: number;
  col: number;
  isBlank: boolean; // true if this tile was a blank assigned a letter
}

export type CellPremium = 'DL' | 'TL' | 'DW' | 'TW' | null;

export interface BoardCell {
  tile: Tile | null;
  premium: CellPremium;
}

export type Board = BoardCell[][];

export interface TilePlacement {
  row: number;
  col: number;
  letter: string;
  isBlank: boolean;
}

export type MoveType = 'play' | 'pass' | 'exchange';
export type GameStatus = 'waiting' | 'active' | 'finished';

export interface GameState {
  id: string;
  player1Id: string;
  player2Id: string | null;
  board: Board;
  currentTurn: 1 | 2;
  player1Score: number;
  player2Score: number;
  status: GameStatus;
  winnerId: string | null;
  inviteCode: string | null;
  consecutivePasses: number;
  // Racks and tile bag are server-only (not sent to opponent)
}

export interface PlayerGameView extends Omit<GameState, 'player1Id' | 'player2Id'> {
  playerNumber: 1 | 2;
  opponentUsername: string;
  rack: Tile[];
  tilesRemaining: number;
  lastMove: MoveRecord | null;
}

export interface MoveRecord {
  playerId: string;
  moveType: MoveType;
  tilesPlaced: TilePlacement[];
  wordsFormed: { word: string; score: number }[];
  totalScore: number;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  rating: number;
}

export interface UserPrivate extends UserPublic {
  ratingDeviation: number;
}

export interface GameSummary {
  id: string;
  opponentUsername: string;
  opponentRating: number;
  playerScore: number;
  opponentScore: number;
  isYourTurn: boolean;
  status: GameStatus;
  updatedAt: string;
}
```

**Step 2: Define tile distribution**

```ts
// packages/shared/src/tiles.ts

import type { Tile } from './types.js';

export const TILE_DISTRIBUTION: { letter: string; points: number; count: number }[] = [
  { letter: 'A', points: 1,  count: 9 },
  { letter: 'B', points: 3,  count: 2 },
  { letter: 'C', points: 3,  count: 2 },
  { letter: 'D', points: 2,  count: 4 },
  { letter: 'E', points: 1,  count: 12 },
  { letter: 'F', points: 4,  count: 2 },
  { letter: 'G', points: 2,  count: 3 },
  { letter: 'H', points: 4,  count: 2 },
  { letter: 'I', points: 1,  count: 9 },
  { letter: 'J', points: 8,  count: 1 },
  { letter: 'K', points: 5,  count: 1 },
  { letter: 'L', points: 1,  count: 4 },
  { letter: 'M', points: 3,  count: 2 },
  { letter: 'N', points: 1,  count: 6 },
  { letter: 'O', points: 1,  count: 8 },
  { letter: 'P', points: 3,  count: 2 },
  { letter: 'Q', points: 10, count: 1 },
  { letter: 'R', points: 1,  count: 6 },
  { letter: 'S', points: 1,  count: 4 },
  { letter: 'T', points: 1,  count: 6 },
  { letter: 'U', points: 1,  count: 4 },
  { letter: 'V', points: 4,  count: 2 },
  { letter: 'W', points: 4,  count: 2 },
  { letter: 'X', points: 8,  count: 1 },
  { letter: 'Y', points: 4,  count: 2 },
  { letter: 'Z', points: 10, count: 1 },
  { letter: '',  points: 0,  count: 2 }, // blanks
];

export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;
export const TOTAL_TILES = 100;

export function createTileBag(): Tile[] {
  const bag: Tile[] = [];
  for (const { letter, points, count } of TILE_DISTRIBUTION) {
    for (let i = 0; i < count; i++) {
      bag.push({ letter, points });
    }
  }
  return bag;
}

export function shuffleBag(bag: Tile[]): Tile[] {
  const shuffled = [...bag];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

**Step 3: Define board premium layout**

```ts
// packages/shared/src/board.ts

import type { Board, BoardCell, CellPremium } from './types.js';

export const BOARD_SIZE = 15;
export const CENTER = 7;
export const MAX_CONSECUTIVE_PASSES = 6; // 3 per player

// Premium square positions (using symmetry - define one quadrant + axes)
const PREMIUM_MAP: Record<string, CellPremium> = {};

function setSymmetric(row: number, col: number, premium: CellPremium) {
  const positions = [
    [row, col], [row, 14 - col], [14 - row, col], [14 - row, 14 - col],
    [col, row], [col, 14 - row], [14 - col, row], [14 - col, 14 - row],
  ];
  for (const [r, c] of positions) {
    PREMIUM_MAP[`${r},${c}`] = premium;
  }
}

// Triple Word
setSymmetric(0, 0, 'TW');
setSymmetric(0, 7, 'TW');

// Double Word
setSymmetric(1, 1, 'DW');
setSymmetric(2, 2, 'DW');
setSymmetric(3, 3, 'DW');
setSymmetric(4, 4, 'DW');
PREMIUM_MAP['7,7'] = 'DW'; // center star

// Triple Letter
setSymmetric(1, 5, 'TL');
setSymmetric(5, 5, 'TL');

// Double Letter
setSymmetric(0, 3, 'DL');
setSymmetric(2, 6, 'DL');
setSymmetric(3, 7, 'DL');
setSymmetric(6, 6, 'DL');

export function getPremium(row: number, col: number): CellPremium {
  return PREMIUM_MAP[`${row},${col}`] ?? null;
}

export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowCells: BoardCell[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      rowCells.push({ tile: null, premium: getPremium(row, col) });
    }
    board.push(rowCells);
  }
  return board;
}
```

**Step 4: Update index.ts to re-export everything**

```ts
// packages/shared/src/index.ts
export * from './types.js';
export * from './tiles.js';
export * from './board.js';
```

**Step 5: Build shared and verify**

Run: `npm run build -w packages/shared`
Expected: Compiles without errors, dist/ created

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types, tile distribution, and board layout"
```

---

### Task 3: Database Setup and Migrations

**Files:**
- Create: `packages/server/src/db/pool.ts`
- Create: `packages/server/src/db/migrate.ts`
- Create: `packages/server/src/db/migrations/001-initial-schema.sql`
- Create: `docker-compose.yml`
- Create: `.env.example`

**Step 1: Create docker-compose.yml**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wordgarden
      POSTGRES_PASSWORD: wordgarden_dev
      POSTGRES_DB: wordgarden
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://wordgarden:wordgarden_dev@db:5432/wordgarden
      SESSION_SECRET: dev-secret-change-in-production
      RP_ID: localhost
      RP_NAME: Word Garden
      ORIGIN: http://localhost:3000
    depends_on:
      - db

volumes:
  pgdata:
```

```
# .env.example
DATABASE_URL=postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden
SESSION_SECRET=dev-secret-change-in-production
RP_ID=localhost
RP_NAME=Word Garden
ORIGIN=http://localhost:5173
```

**Step 2: Create DB connection pool**

```ts
// packages/server/src/db/pool.ts
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden',
});

export default pool;
```

**Step 3: Create migration runner**

```ts
// packages/server/src/db/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`Migration applied: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}
```

**Step 4: Create initial schema migration**

```sql
-- packages/server/src/db/migrations/001-initial-schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL CHECK (length(username) BETWEEN 3 AND 20),
  password_hash TEXT,
  rating DOUBLE PRECISION NOT NULL DEFAULT 1500,
  rating_deviation DOUBLE PRECISION NOT NULL DEFAULT 350,
  rating_volatility DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  board_state JSONB NOT NULL,
  tile_bag JSONB NOT NULL,
  player1_rack JSONB NOT NULL,
  player2_rack JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_turn SMALLINT NOT NULL DEFAULT 1,
  player1_score INT NOT NULL DEFAULT 0,
  player2_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  winner_id UUID REFERENCES users(id),
  invite_code TEXT UNIQUE,
  consecutive_passes SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  move_type TEXT NOT NULL CHECK (move_type IN ('play', 'pass', 'exchange')),
  tiles_placed JSONB NOT NULL DEFAULT '[]'::jsonb,
  words_formed JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  rating DOUBLE PRECISION NOT NULL,
  rating_deviation DOUBLE PRECISION NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_games_player1 ON games(player1_id);
CREATE INDEX idx_games_player2 ON games(player2_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_invite_code ON games(invite_code);
CREATE INDEX idx_moves_game ON moves(game_id);
CREATE INDEX idx_matchmaking_rating ON matchmaking_queue(rating);
```

**Step 5: Wire migrations into server startup**

Modify `packages/server/src/index.ts` to call `runMigrations()` before starting:

```ts
// packages/server/src/index.ts
import express from 'express';
import { runMigrations } from './db/migrate.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`Word Garden server running on port ${PORT}`);
  });
}

start().catch(console.error);
```

**Step 6: Start DB and verify migrations**

Run: `docker compose up db -d`
Expected: PostgreSQL container starts

Create `.env` from example:
Run: `cp .env.example .env`

Run: `npm run dev:server` (briefly, then Ctrl+C)
Expected: "Migration applied: 001-initial-schema.sql" in output

**Step 7: Commit**

```bash
git add docker-compose.yml .env.example packages/server/src/db/ packages/server/src/index.ts
git commit -m "feat: add database setup with migrations and initial schema"
```

---

### Task 4: Dictionary Service

**Files:**
- Create: `packages/server/src/services/dictionary.ts`
- Create: `packages/server/src/services/__tests__/dictionary.test.ts`
- Create: `packages/server/data/` (directory for word list)
- Modify: `packages/server/package.json` (add vitest config if needed)

**Step 1: Download ENABLE word list**

Run: `mkdir -p packages/server/data`
Run: `curl -L "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt" -o packages/server/data/enable.txt`
Expected: Word list file downloaded (~1.8MB, ~173k words)

**Step 2: Write the failing test**

```ts
// packages/server/src/services/__tests__/dictionary.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadDictionary, isValidWord } from '../dictionary.js';

describe('dictionary', () => {
  beforeAll(async () => {
    await loadDictionary();
  });

  it('accepts common valid words', () => {
    expect(isValidWord('HELLO')).toBe(true);
    expect(isValidWord('WORLD')).toBe(true);
    expect(isValidWord('QUIZ')).toBe(true);
  });

  it('rejects invalid words', () => {
    expect(isValidWord('XYZZY')).toBe(false);
    expect(isValidWord('ASDFG')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isValidWord('hello')).toBe(true);
    expect(isValidWord('Hello')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidWord('')).toBe(false);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -w packages/server -- --run src/services/__tests__/dictionary.test.ts`
Expected: FAIL — cannot find module `../dictionary.js`

**Step 4: Write the implementation**

```ts
// packages/server/src/services/dictionary.ts
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let words: Set<string> | null = null;

export async function loadDictionary(): Promise<void> {
  if (words) return;
  const filePath = join(__dirname, '../../data/enable.txt');
  const content = await readFile(filePath, 'utf-8');
  words = new Set(
    content
      .split('\n')
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length > 0)
  );
  console.log(`Dictionary loaded: ${words.size} words`);
}

export function isValidWord(word: string): boolean {
  if (!words) throw new Error('Dictionary not loaded');
  if (!word || word.length === 0) return false;
  return words.has(word.toUpperCase());
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -w packages/server -- --run src/services/__tests__/dictionary.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/server/data/enable.txt packages/server/src/services/
git commit -m "feat: add dictionary service with ENABLE word list"
```

---

### Task 5: Game Engine — Core Logic

**Files:**
- Create: `packages/server/src/services/gameEngine.ts`
- Create: `packages/server/src/services/__tests__/gameEngine.test.ts`

This is the largest task — the game engine handles move validation, word detection, and scoring.

**Step 1: Write failing tests for word detection**

```ts
// packages/server/src/services/__tests__/gameEngine.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createEmptyBoard, BOARD_SIZE } from '@word-garden/shared';
import type { Board, TilePlacement } from '@word-garden/shared';
import { findFormedWords, validatePlacement, scoreMove, initializeGame } from '../gameEngine.js';
import { loadDictionary } from '../dictionary.js';

function placeTileOnBoard(board: Board, row: number, col: number, letter: string, points: number): Board {
  const newBoard = board.map(r => r.map(c => ({ ...c })));
  newBoard[row][col] = { ...newBoard[row][col], tile: { letter, points } };
  return newBoard;
}

describe('gameEngine', () => {
  beforeAll(async () => {
    await loadDictionary();
  });

  describe('validatePlacement', () => {
    it('rejects empty placement', () => {
      const board = createEmptyBoard();
      const result = validatePlacement(board, [], true);
      expect(result.valid).toBe(false);
    });

    it('accepts a valid first move through center', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 5, letter: 'H', isBlank: false },
        { row: 7, col: 6, letter: 'E', isBlank: false },
        { row: 7, col: 7, letter: 'L', isBlank: false },
        { row: 7, col: 8, letter: 'L', isBlank: false },
        { row: 7, col: 9, letter: 'O', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, true);
      expect(result.valid).toBe(true);
    });

    it('rejects first move not through center', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 0, col: 0, letter: 'H', isBlank: false },
        { row: 0, col: 1, letter: 'I', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, true);
      expect(result.valid).toBe(false);
    });

    it('rejects tiles not in a line', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 7, letter: 'A', isBlank: false },
        { row: 8, col: 8, letter: 'B', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, true);
      expect(result.valid).toBe(false);
    });

    it('accepts tiles with gaps filled by existing tiles', () => {
      let board = createEmptyBoard();
      // Place "HI" on the board first
      board = placeTileOnBoard(board, 7, 7, 'H', 4);
      board = placeTileOnBoard(board, 7, 8, 'I', 1);
      // Now place "S" extending to "HIS"
      const tiles: TilePlacement[] = [
        { row: 7, col: 9, letter: 'S', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, false);
      expect(result.valid).toBe(true);
    });
  });

  describe('findFormedWords', () => {
    it('finds horizontal word on first move', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 6, letter: 'H', isBlank: false },
        { row: 7, col: 7, letter: 'I', isBlank: false },
      ];
      const words = findFormedWords(board, tiles);
      expect(words).toHaveLength(1);
      expect(words[0].word).toBe('HI');
    });

    it('finds cross-words when extending', () => {
      let board = createEmptyBoard();
      board = placeTileOnBoard(board, 7, 7, 'H', 4);
      board = placeTileOnBoard(board, 7, 8, 'I', 1);
      // Place "A" below "H" to form "HA" vertically and "AT" if T placed too
      const tiles: TilePlacement[] = [
        { row: 8, col: 7, letter: 'A', isBlank: false },
      ];
      const words = findFormedWords(board, tiles);
      expect(words.some(w => w.word === 'HA')).toBe(true);
    });
  });

  describe('scoreMove', () => {
    it('scores a simple word correctly', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 6, letter: 'H', isBlank: false },
        { row: 7, col: 7, letter: 'I', isBlank: false },
      ];
      const score = scoreMove(board, tiles);
      // H=4, I=1, center square is DW, so (4+1)*2 = 10
      expect(score.totalScore).toBe(10);
    });

    it('applies bingo bonus for 7 tiles', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 4, letter: 'G', isBlank: false },
        { row: 7, col: 5, letter: 'A', isBlank: false },
        { row: 7, col: 6, letter: 'R', isBlank: false },
        { row: 7, col: 7, letter: 'D', isBlank: false },
        { row: 7, col: 8, letter: 'E', isBlank: false },
        { row: 7, col: 9, letter: 'N', isBlank: false },
        { row: 7, col: 10, letter: 'S', isBlank: false },
      ];
      const score = scoreMove(board, tiles);
      // Should include 50-point bingo bonus
      expect(score.totalScore).toBeGreaterThanOrEqual(50);
      expect(score.bingo).toBe(true);
    });
  });

  describe('initializeGame', () => {
    it('creates a game with full tile bag minus two racks', () => {
      const game = initializeGame('player1-id');
      expect(game.board).toHaveLength(15);
      expect(game.player1Rack).toHaveLength(7);
      expect(game.tileBag).toHaveLength(100 - 7); // 93 tiles remain
      expect(game.currentTurn).toBe(1);
      expect(game.player1Score).toBe(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w packages/server -- --run src/services/__tests__/gameEngine.test.ts`
Expected: FAIL — cannot find module `../gameEngine.js`

**Step 3: Write the game engine implementation**

```ts
// packages/server/src/services/gameEngine.ts
import {
  createEmptyBoard, BOARD_SIZE, CENTER, MAX_CONSECUTIVE_PASSES,
  createTileBag, shuffleBag, RACK_SIZE, BINGO_BONUS,
} from '@word-garden/shared';
import type { Board, Tile, TilePlacement, CellPremium } from '@word-garden/shared';
import { isValidWord } from './dictionary.js';

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface WordFound {
  word: string;
  cells: { row: number; col: number; letter: string; points: number; premium: CellPremium; isNew: boolean }[];
}

interface ScoreResult {
  totalScore: number;
  wordScores: { word: string; score: number }[];
  bingo: boolean;
}

interface GameInit {
  board: Board;
  tileBag: Tile[];
  player1Rack: Tile[];
  currentTurn: 1 | 2;
  player1Score: number;
  player2Score: number;
}

export function initializeGame(player1Id: string): GameInit {
  const board = createEmptyBoard();
  let tileBag = shuffleBag(createTileBag());
  const player1Rack = tileBag.splice(0, RACK_SIZE);
  return {
    board,
    tileBag,
    player1Rack,
    currentTurn: 1,
    player1Score: 0,
    player2Score: 0,
  };
}

export function drawTilesForPlayer2(tileBag: Tile[]): { rack: Tile[]; remainingBag: Tile[] } {
  const bag = [...tileBag];
  const rack = bag.splice(0, RACK_SIZE);
  return { rack, remainingBag: bag };
}

export function validatePlacement(board: Board, tiles: TilePlacement[], isFirstMove: boolean): ValidationResult {
  if (tiles.length === 0) {
    return { valid: false, error: 'No tiles placed' };
  }

  // Check all positions are within bounds and unoccupied
  for (const t of tiles) {
    if (t.row < 0 || t.row >= BOARD_SIZE || t.col < 0 || t.col >= BOARD_SIZE) {
      return { valid: false, error: 'Tile out of bounds' };
    }
    if (board[t.row][t.col].tile !== null) {
      return { valid: false, error: 'Cell already occupied' };
    }
  }

  // Check for duplicate positions
  const posSet = new Set(tiles.map(t => `${t.row},${t.col}`));
  if (posSet.size !== tiles.length) {
    return { valid: false, error: 'Duplicate positions' };
  }

  // Check all tiles in same row or same column
  const rows = new Set(tiles.map(t => t.row));
  const cols = new Set(tiles.map(t => t.col));
  const isHorizontal = rows.size === 1;
  const isVertical = cols.size === 1;

  if (!isHorizontal && !isVertical) {
    return { valid: false, error: 'Tiles must be in a single row or column' };
  }

  // For single tile, both are true — that's fine

  // Check continuity (no gaps unless filled by existing tiles)
  if (isHorizontal) {
    const row = tiles[0].row;
    const minCol = Math.min(...tiles.map(t => t.col));
    const maxCol = Math.max(...tiles.map(t => t.col));
    for (let col = minCol; col <= maxCol; col++) {
      const isNewTile = posSet.has(`${row},${col}`);
      const isExisting = board[row][col].tile !== null;
      if (!isNewTile && !isExisting) {
        return { valid: false, error: 'Gap in tile placement' };
      }
    }
  } else {
    const col = tiles[0].col;
    const minRow = Math.min(...tiles.map(t => t.row));
    const maxRow = Math.max(...tiles.map(t => t.row));
    for (let row = minRow; row <= maxRow; row++) {
      const isNewTile = posSet.has(`${row},${col}`);
      const isExisting = board[row][col].tile !== null;
      if (!isNewTile && !isExisting) {
        return { valid: false, error: 'Gap in tile placement' };
      }
    }
  }

  // First move must cross center
  if (isFirstMove) {
    const crossesCenter = tiles.some(t => t.row === CENTER && t.col === CENTER);
    if (!crossesCenter) {
      return { valid: false, error: 'First move must cross the center square' };
    }
  } else {
    // Must be adjacent to at least one existing tile
    let touchesExisting = false;
    for (const t of tiles) {
      const neighbors = [
        [t.row - 1, t.col], [t.row + 1, t.col],
        [t.row, t.col - 1], [t.row, t.col + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
          if (board[nr][nc].tile !== null && !posSet.has(`${nr},${nc}`)) {
            touchesExisting = true;
            break;
          }
        }
      }
      if (touchesExisting) break;
    }
    if (!touchesExisting) {
      return { valid: false, error: 'Tiles must connect to existing tiles' };
    }
  }

  return { valid: true };
}

export function findFormedWords(board: Board, tiles: TilePlacement[]): WordFound[] {
  // Create a temporary board with the new tiles placed
  const tempBoard = board.map(r => r.map(c => ({ ...c })));
  const newPositions = new Set(tiles.map(t => `${t.row},${t.col}`));

  for (const t of tiles) {
    tempBoard[t.row][t.col] = {
      ...tempBoard[t.row][t.col],
      tile: { letter: t.letter, points: t.isBlank ? 0 : getLetterPoints(t.letter) },
    };
  }

  const words: WordFound[] = [];
  const wordsSeen = new Set<string>(); // avoid duplicates

  function extractWord(startRow: number, startCol: number, dRow: number, dCol: number): WordFound | null {
    const cells: WordFound['cells'] = [];
    let row = startRow;
    let col = startCol;

    while (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && tempBoard[row][col].tile) {
      const cell = tempBoard[row][col];
      cells.push({
        row, col,
        letter: cell.tile!.letter,
        points: cell.tile!.points,
        premium: cell.premium,
        isNew: newPositions.has(`${row},${col}`),
      });
      row += dRow;
      col += dCol;
    }

    if (cells.length < 2) return null;
    const word = cells.map(c => c.letter).join('');
    const key = `${cells[0].row},${cells[0].col},${dRow},${dCol}`;
    if (wordsSeen.has(key)) return null;
    wordsSeen.add(key);
    return { word, cells };
  }

  // For each new tile, find words in both directions
  for (const t of tiles) {
    // Horizontal: find start of word
    let startCol = t.col;
    while (startCol > 0 && tempBoard[t.row][startCol - 1].tile) startCol--;
    const hWord = extractWord(t.row, startCol, 0, 1);
    if (hWord) words.push(hWord);

    // Vertical: find start of word
    let startRow = t.row;
    while (startRow > 0 && tempBoard[startRow - 1][t.col].tile) startRow--;
    const vWord = extractWord(startRow, t.col, 1, 0);
    if (vWord) words.push(vWord);
  }

  return words;
}

export function scoreMove(board: Board, tiles: TilePlacement[]): ScoreResult {
  const words = findFormedWords(board, tiles);
  let totalScore = 0;
  const wordScores: { word: string; score: number }[] = [];

  for (const w of words) {
    let wordScore = 0;
    let wordMultiplier = 1;

    for (const cell of w.cells) {
      let letterScore = cell.points;

      // Premiums only apply to newly placed tiles
      if (cell.isNew) {
        switch (cell.premium) {
          case 'DL': letterScore *= 2; break;
          case 'TL': letterScore *= 3; break;
          case 'DW': wordMultiplier *= 2; break;
          case 'TW': wordMultiplier *= 3; break;
        }
      }

      wordScore += letterScore;
    }

    wordScore *= wordMultiplier;
    totalScore += wordScore;
    wordScores.push({ word: w.word, score: wordScore });
  }

  const bingo = tiles.length === RACK_SIZE;
  if (bingo) {
    totalScore += BINGO_BONUS;
  }

  return { totalScore, wordScores, bingo };
}

function getLetterPoints(letter: string): number {
  const points: Record<string, number> = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
    J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
    S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };
  return points[letter.toUpperCase()] ?? 0;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w packages/server -- --run src/services/__tests__/gameEngine.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/services/gameEngine.ts packages/server/src/services/__tests__/gameEngine.test.ts
git commit -m "feat: add game engine with move validation, word detection, and scoring"
```

---

### Task 6: Glicko-2 Rating Service

**Files:**
- Create: `packages/server/src/services/glicko2.ts`
- Create: `packages/server/src/services/__tests__/glicko2.test.ts`

**Step 1: Write failing tests**

```ts
// packages/server/src/services/__tests__/glicko2.test.ts
import { describe, it, expect } from 'vitest';
import { calculateNewRatings } from '../glicko2.js';

describe('glicko2', () => {
  it('winner gains rating, loser drops', () => {
    const result = calculateNewRatings(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      { rating: 1500, deviation: 200, volatility: 0.06 },
      1, // player1 wins
    );
    expect(result.player1.rating).toBeGreaterThan(1500);
    expect(result.player2.rating).toBeLessThan(1500);
  });

  it('deviation decreases after a game', () => {
    const result = calculateNewRatings(
      { rating: 1500, deviation: 350, volatility: 0.06 },
      { rating: 1500, deviation: 350, volatility: 0.06 },
      1,
    );
    expect(result.player1.deviation).toBeLessThan(350);
    expect(result.player2.deviation).toBeLessThan(350);
  });

  it('upset produces larger rating change', () => {
    const expected = calculateNewRatings(
      { rating: 1200, deviation: 100, volatility: 0.06 },
      { rating: 1800, deviation: 100, volatility: 0.06 },
      1, // lower-rated player wins (upset)
    );
    const normal = calculateNewRatings(
      { rating: 1800, deviation: 100, volatility: 0.06 },
      { rating: 1200, deviation: 100, volatility: 0.06 },
      1, // higher-rated player wins (expected)
    );
    const upsetGain = expected.player1.rating - 1200;
    const normalGain = normal.player1.rating - 1800;
    expect(upsetGain).toBeGreaterThan(normalGain);
  });

  it('handles draw', () => {
    const result = calculateNewRatings(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      { rating: 1500, deviation: 200, volatility: 0.06 },
      0, // draw
    );
    // Equal players draw — ratings should stay close to 1500
    expect(Math.abs(result.player1.rating - 1500)).toBeLessThan(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w packages/server -- --run src/services/__tests__/glicko2.test.ts`
Expected: FAIL

**Step 3: Write the Glicko-2 implementation**

```ts
// packages/server/src/services/glicko2.ts

// Glicko-2 implementation based on Mark Glickman's paper
// http://www.glicko.net/glicko/glicko2.pdf

const TAU = 0.5; // system constant constraining volatility change
const EPSILON = 0.000001;
const SCALE = 173.7178; // conversion factor between Glicko-1 and Glicko-2 scales

interface GlickoPlayer {
  rating: number;
  deviation: number;
  volatility: number;
}

interface RatingResult {
  player1: GlickoPlayer;
  player2: GlickoPlayer;
}

function toGlicko2Scale(rating: number, deviation: number): { mu: number; phi: number } {
  return {
    mu: (rating - 1500) / SCALE,
    phi: deviation / SCALE,
  };
}

function fromGlicko2Scale(mu: number, phi: number): { rating: number; deviation: number } {
  return {
    rating: mu * SCALE + 1500,
    deviation: phi * SCALE,
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

function computeNewVolatility(sigma: number, phi: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  function f(x: number): number {
    const ex = Math.exp(x);
    const d = phiSq + v + ex;
    return (ex * (deltaSq - phiSq - v - ex)) / (2 * d * d) - (x - a) / (TAU * TAU);
  }

  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);

  while (Math.abs(B - A) > EPSILON) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(B / 2);
}

function updatePlayer(
  player: { mu: number; phi: number; sigma: number },
  opponent: { mu: number; phi: number },
  score: number,
): { mu: number; phi: number; sigma: number } {
  const gPhiJ = g(opponent.phi);
  const eVal = E(player.mu, opponent.mu, opponent.phi);

  const v = 1 / (gPhiJ * gPhiJ * eVal * (1 - eVal));
  const delta = v * gPhiJ * (score - eVal);

  const newSigma = computeNewVolatility(player.sigma, player.phi, v, delta);

  const phiStar = Math.sqrt(player.phi * player.phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = player.mu + newPhi * newPhi * gPhiJ * (score - eVal);

  return { mu: newMu, phi: newPhi, sigma: newSigma };
}

/**
 * Calculate new ratings after a game.
 * @param player1 - Player 1's current rating
 * @param player2 - Player 2's current rating
 * @param outcome - 1 = player1 wins, 0 = draw, -1 = player2 wins
 */
export function calculateNewRatings(
  player1: GlickoPlayer,
  player2: GlickoPlayer,
  outcome: 1 | 0 | -1,
): RatingResult {
  const p1 = { ...toGlicko2Scale(player1.rating, player1.deviation), sigma: player1.volatility };
  const p2 = { ...toGlicko2Scale(player2.rating, player2.deviation), sigma: player2.volatility };

  const s1 = outcome === 1 ? 1 : outcome === 0 ? 0.5 : 0;
  const s2 = 1 - s1;

  const newP1 = updatePlayer(p1, p2, s1);
  const newP2 = updatePlayer(p2, p1, s2);

  const r1 = fromGlicko2Scale(newP1.mu, newP1.phi);
  const r2 = fromGlicko2Scale(newP2.mu, newP2.phi);

  return {
    player1: { rating: r1.rating, deviation: r1.deviation, volatility: newP1.sigma },
    player2: { rating: r2.rating, deviation: r2.deviation, volatility: newP2.sigma },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w packages/server -- --run src/services/__tests__/glicko2.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/services/glicko2.ts packages/server/src/services/__tests__/glicko2.test.ts
git commit -m "feat: add Glicko-2 rating calculation service"
```

---

### Task 7: Authentication — WebAuthn + Password

**Files:**
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/middleware/auth.ts`
- Create: `packages/server/src/services/session.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/package.json` (add deps)

**Step 1: Install auth dependencies**

Run: `npm install @simplewebauthn/server bcrypt jsonwebtoken -w packages/server`
Run: `npm install @types/bcrypt @types/jsonwebtoken -D -w packages/server`

**Step 2: Create session service**

```ts
// packages/server/src/services/session.ts
import jwt from 'jsonwebtoken';

const SECRET = process.env.SESSION_SECRET || 'dev-secret';
const EXPIRY = '30d';

export interface SessionPayload {
  userId: string;
  username: string;
}

export function createToken(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
```

**Step 3: Create auth middleware**

```ts
// packages/server/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type SessionPayload } from '../services/session.js';

declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.user = payload;
  next();
}
```

**Step 4: Create auth routes**

```ts
// packages/server/src/routes/auth.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import pool from '../db/pool.js';
import { createToken } from '../services/session.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const rpName = process.env.RP_NAME || 'Word Garden';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:5173';

// In-memory challenge store (per-session, short-lived)
const challenges = new Map<string, string>();

// POST /auth/register/password
router.post('/register/password', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, rating',
    [username, hash],
  );
  const user = result.rows[0];
  const token = createToken({ userId: user.id, username: user.username });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ id: user.id, username: user.username, rating: user.rating });
});

// POST /auth/login/password
router.post('/login/password', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const result = await pool.query('SELECT id, username, password_hash, rating FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const user = result.rows[0];
  if (!user.password_hash) {
    res.status(401).json({ error: 'This account uses passkey authentication' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = createToken({ userId: user.id, username: user.username });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ id: user.id, username: user.username, rating: user.rating });
});

// POST /auth/register — WebAuthn registration options
router.post('/register/passkey/options', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }
  if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: username,
    attestationType: 'none',
  });

  challenges.set(username, options.challenge);
  setTimeout(() => challenges.delete(username), 5 * 60 * 1000);

  res.json(options);
});

// POST /auth/register/passkey/verify
router.post('/register/passkey/verify', async (req, res) => {
  const { username, credential } = req.body;
  const expectedChallenge = challenges.get(username);
  if (!expectedChallenge) {
    res.status(400).json({ error: 'No pending registration' });
    return;
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Verification failed' });
      return;
    }

    const { credential: cred } = verification.registrationInfo;

    const userResult = await pool.query(
      'INSERT INTO users (username) VALUES ($1) RETURNING id, username, rating',
      [username],
    );
    const user = userResult.rows[0];

    await pool.query(
      'INSERT INTO user_credentials (user_id, credential_id, public_key, counter) VALUES ($1, $2, $3, $4)',
      [user.id, cred.id, Buffer.from(cred.publicKey), cred.counter],
    );

    challenges.delete(username);
    const token = createToken({ userId: user.id, username: user.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username, rating: user.rating });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

// POST /auth/login/passkey/options
router.post('/login/passkey/options', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }

  const creds = await pool.query(
    'SELECT uc.credential_id FROM user_credentials uc JOIN users u ON uc.user_id = u.id WHERE u.username = $1',
    [username],
  );

  if (creds.rows.length === 0) {
    res.status(404).json({ error: 'No passkeys found for this user' });
    return;
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.rows.map((row: { credential_id: string }) => ({
      id: row.credential_id,
    })),
  });

  challenges.set(`login:${username}`, options.challenge);
  setTimeout(() => challenges.delete(`login:${username}`), 5 * 60 * 1000);

  res.json(options);
});

// POST /auth/login/passkey/verify
router.post('/login/passkey/verify', async (req, res) => {
  const { username, credential } = req.body;
  const expectedChallenge = challenges.get(`login:${username}`);
  if (!expectedChallenge) {
    res.status(400).json({ error: 'No pending login' });
    return;
  }

  try {
    const credResult = await pool.query(
      `SELECT uc.id, uc.credential_id, uc.public_key, uc.counter, u.id as user_id, u.username, u.rating
       FROM user_credentials uc JOIN users u ON uc.user_id = u.id
       WHERE u.username = $1 AND uc.credential_id = $2`,
      [username, credential.id],
    );

    if (credResult.rows.length === 0) {
      res.status(401).json({ error: 'Credential not found' });
      return;
    }

    const stored = credResult.rows[0];

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credential_id,
        publicKey: stored.public_key,
        counter: stored.counter,
      },
    });

    if (!verification.verified) {
      res.status(401).json({ error: 'Verification failed' });
      return;
    }

    // Update counter
    await pool.query(
      'UPDATE user_credentials SET counter = $1 WHERE id = $2',
      [verification.authenticationInfo.newCounter, stored.id],
    );

    challenges.delete(`login:${username}`);
    const token = createToken({ userId: stored.user_id, username: stored.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ id: stored.user_id, username: stored.username, rating: stored.rating });
  } catch (err) {
    res.status(401).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, username, rating FROM users WHERE id = $1', [req.user!.userId]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(result.rows[0]);
});

export default router;
```

**Step 5: Wire auth routes into server**

```ts
// packages/server/src/index.ts
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { runMigrations } from './db/migrate.js';
import { loadDictionary } from './services/dictionary.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);

async function start() {
  await runMigrations();
  await loadDictionary();
  app.listen(PORT, () => {
    console.log(`Word Garden server running on port ${PORT}`);
  });
}

start().catch(console.error);
```

**Step 6: Verify server starts with auth routes**

Run: `npm run dev:server` (briefly)
Expected: Server starts, migrations run, dictionary loads, no errors

**Step 7: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/middleware/auth.ts packages/server/src/services/session.ts packages/server/src/index.ts packages/server/package.json package-lock.json
git commit -m "feat: add authentication with WebAuthn passkeys and password fallback"
```

---

### Task 8: Game API Routes

**Files:**
- Create: `packages/server/src/routes/games.ts`
- Create: `packages/server/src/services/matchmaking.ts`
- Create: `packages/server/src/services/sse.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create SSE service**

```ts
// packages/server/src/services/sse.ts
import type { Response } from 'express';

const clients = new Map<string, Response[]>();

export function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, []);
  clients.get(userId)!.push(res);
  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      const idx = userClients.indexOf(res);
      if (idx !== -1) userClients.splice(idx, 1);
      if (userClients.length === 0) clients.delete(userId);
    }
  });
}

export function sendEvent(userId: string, event: string, data: unknown): void {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of userClients) {
    res.write(payload);
  }
}
```

**Step 2: Create matchmaking service**

```ts
// packages/server/src/services/matchmaking.ts
import pool from '../db/pool.js';
import { sendEvent } from './sse.js';
import { initializeGame, drawTilesForPlayer2 } from './gameEngine.js';
import { createEmptyBoard } from '@word-garden/shared';

export async function enterQueue(userId: string, rating: number, ratingDeviation: number): Promise<{ matched: boolean; gameId?: string }> {
  // Try to find a match first
  const match = await findMatch(userId, rating);
  if (match) {
    return { matched: true, gameId: match };
  }

  // No match found, enter queue
  await pool.query(
    'INSERT INTO matchmaking_queue (user_id, rating, rating_deviation) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
    [userId, rating, ratingDeviation],
  );
  return { matched: false };
}

export async function leaveQueue(userId: string): Promise<void> {
  await pool.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);
}

async function findMatch(userId: string, rating: number): Promise<string | null> {
  // Look for a player in queue within rating range
  const result = await pool.query(
    `SELECT id, user_id, rating FROM matchmaking_queue
     WHERE user_id != $1
     AND rating BETWEEN $2 - (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
                  AND $2 + (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
     ORDER BY ABS(rating - $2) ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [userId, rating],
  );

  if (result.rows.length === 0) return null;

  const opponent = result.rows[0];

  // Remove opponent from queue
  await pool.query('DELETE FROM matchmaking_queue WHERE id = $1', [opponent.id]);
  // Remove self from queue if present
  await pool.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);

  // Create game
  const game = initializeGame(userId);
  const { rack: player2Rack, remainingBag } = drawTilesForPlayer2(game.tileBag);

  const gameResult = await pool.query(
    `INSERT INTO games (player1_id, player2_id, board_state, tile_bag, player1_rack, player2_rack, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
    [userId, opponent.user_id, JSON.stringify(game.board), JSON.stringify(remainingBag),
     JSON.stringify(game.player1Rack), JSON.stringify(player2Rack)],
  );

  const gameId = gameResult.rows[0].id;

  // Notify both players
  sendEvent(userId, 'match_found', { gameId });
  sendEvent(opponent.user_id, 'match_found', { gameId });

  return gameId;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GARDEN-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export { generateInviteCode };
```

**Step 3: Create game routes**

```ts
// packages/server/src/routes/games.ts
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { initializeGame, drawTilesForPlayer2, validatePlacement, findFormedWords, scoreMove } from '../services/gameEngine.js';
import { isValidWord } from '../services/dictionary.js';
import { enterQueue, leaveQueue, generateInviteCode } from '../services/matchmaking.js';
import { sendEvent } from '../services/sse.js';
import { calculateNewRatings } from '../services/glicko2.js';
import { RACK_SIZE, MAX_CONSECUTIVE_PASSES } from '@word-garden/shared';
import type { TilePlacement, Tile } from '@word-garden/shared';

const router = Router();

// POST /games — create a new game with invite code
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const game = initializeGame(userId);
  const inviteCode = generateInviteCode();

  const result = await pool.query(
    `INSERT INTO games (player1_id, board_state, tile_bag, player1_rack, invite_code, status)
     VALUES ($1, $2, $3, $4, $5, 'waiting') RETURNING id, invite_code`,
    [userId, JSON.stringify(game.board), JSON.stringify(game.tileBag),
     JSON.stringify(game.player1Rack), inviteCode],
  );

  res.json({ id: result.rows[0].id, inviteCode: result.rows[0].invite_code });
});

// POST /games/join/:inviteCode
router.post('/join/:inviteCode', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { inviteCode } = req.params;

  const gameResult = await pool.query(
    `SELECT * FROM games WHERE invite_code = $1 AND status = 'waiting' FOR UPDATE`,
    [inviteCode],
  );

  if (gameResult.rows.length === 0) {
    res.status(404).json({ error: 'Game not found or already started' });
    return;
  }

  const game = gameResult.rows[0];
  if (game.player1_id === userId) {
    res.status(400).json({ error: 'Cannot join your own game' });
    return;
  }

  const tileBag: Tile[] = game.tile_bag;
  const { rack, remainingBag } = drawTilesForPlayer2(tileBag);

  await pool.query(
    `UPDATE games SET player2_id = $1, player2_rack = $2, tile_bag = $3, status = 'active', updated_at = NOW()
     WHERE id = $4`,
    [userId, JSON.stringify(rack), JSON.stringify(remainingBag), game.id],
  );

  sendEvent(game.player1_id, 'game_started', { gameId: game.id });
  res.json({ id: game.id });
});

// POST /games/matchmake
router.post('/matchmake', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const userResult = await pool.query('SELECT rating, rating_deviation FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];

  const result = await enterQueue(userId, user.rating, user.rating_deviation);
  res.json(result);
});

// DELETE /games/matchmake
router.delete('/matchmake', requireAuth, async (req, res) => {
  await leaveQueue(req.user!.userId);
  res.json({ ok: true });
});

// GET /games — list active/recent games
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const result = await pool.query(
    `SELECT g.id, g.player1_id, g.player2_id, g.player1_score, g.player2_score,
            g.current_turn, g.status, g.updated_at, g.invite_code,
            u1.username as player1_username, u1.rating as player1_rating,
            u2.username as player2_username, u2.rating as player2_rating
     FROM games g
     JOIN users u1 ON g.player1_id = u1.id
     LEFT JOIN users u2 ON g.player2_id = u2.id
     WHERE g.player1_id = $1 OR g.player2_id = $1
     ORDER BY g.updated_at DESC
     LIMIT 20`,
    [userId],
  );

  const games = result.rows.map((g: any) => {
    const isPlayer1 = g.player1_id === userId;
    return {
      id: g.id,
      opponentUsername: isPlayer1 ? g.player2_username : g.player1_username,
      opponentRating: isPlayer1 ? g.player2_rating : g.player1_rating,
      playerScore: isPlayer1 ? g.player1_score : g.player2_score,
      opponentScore: isPlayer1 ? g.player2_score : g.player1_score,
      isYourTurn: g.status === 'active' && ((isPlayer1 && g.current_turn === 1) || (!isPlayer1 && g.current_turn === 2)),
      status: g.status,
      inviteCode: g.status === 'waiting' ? g.invite_code : null,
      updatedAt: g.updated_at,
    };
  });

  res.json(games);
});

// GET /games/:id — get game state
router.get('/:id', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const gameResult = await pool.query(
    `SELECT g.*, u1.username as player1_username, u2.username as player2_username
     FROM games g
     JOIN users u1 ON g.player1_id = u1.id
     LEFT JOIN users u2 ON g.player2_id = u2.id
     WHERE g.id = $1`,
    [req.params.id],
  );

  if (gameResult.rows.length === 0) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const g = gameResult.rows[0];
  const isPlayer1 = g.player1_id === userId;
  const isPlayer2 = g.player2_id === userId;
  if (!isPlayer1 && !isPlayer2) {
    res.status(403).json({ error: 'Not a participant in this game' });
    return;
  }

  // Get last move
  const lastMoveResult = await pool.query(
    'SELECT * FROM moves WHERE game_id = $1 ORDER BY created_at DESC LIMIT 1',
    [g.id],
  );

  const lastMove = lastMoveResult.rows[0] ?? null;

  res.json({
    id: g.id,
    playerNumber: isPlayer1 ? 1 : 2,
    opponentUsername: isPlayer1 ? g.player2_username : g.player1_username,
    board: g.board_state,
    currentTurn: g.current_turn,
    player1Score: g.player1_score,
    player2Score: g.player2_score,
    status: g.status,
    winnerId: g.winner_id,
    rack: isPlayer1 ? g.player1_rack : g.player2_rack,
    tilesRemaining: g.tile_bag.length,
    lastMove: lastMove ? {
      playerId: lastMove.player_id,
      moveType: lastMove.move_type,
      tilesPlaced: lastMove.tiles_placed,
      wordsFormed: lastMove.words_formed,
      totalScore: lastMove.score,
      createdAt: lastMove.created_at,
    } : null,
  });
});

// POST /games/:id/move
router.post('/:id/move', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { moveType, tiles, exchangeTiles } = req.body as {
    moveType: 'play' | 'pass' | 'exchange';
    tiles?: TilePlacement[];
    exchangeTiles?: number[]; // indices into rack
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      'SELECT * FROM games WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const g = gameResult.rows[0];
    if (g.status !== 'active') {
      res.status(400).json({ error: 'Game is not active' });
      return;
    }

    const isPlayer1 = g.player1_id === userId;
    const isPlayer2 = g.player2_id === userId;
    if (!isPlayer1 && !isPlayer2) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }

    const playerNum = isPlayer1 ? 1 : 2;
    if (g.current_turn !== playerNum) {
      res.status(400).json({ error: 'Not your turn' });
      return;
    }

    const board = g.board_state;
    const rack: Tile[] = isPlayer1 ? g.player1_rack : g.player2_rack;
    let tileBag: Tile[] = g.tile_bag;
    const isFirstMove = board.every((row: any[]) => row.every((cell: any) => cell.tile === null));

    if (moveType === 'play') {
      if (!tiles || tiles.length === 0) {
        res.status(400).json({ error: 'No tiles provided' });
        return;
      }

      // Validate tiles are in player's rack
      const rackCopy = [...rack];
      for (const t of tiles) {
        const idx = rackCopy.findIndex(r =>
          t.isBlank ? r.letter === '' : r.letter === t.letter
        );
        if (idx === -1) {
          res.status(400).json({ error: `Tile ${t.letter} not in your rack` });
          return;
        }
        rackCopy.splice(idx, 1);
      }

      // Validate placement
      const validation = validatePlacement(board, tiles, isFirstMove);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      // Check all formed words are valid
      const words = findFormedWords(board, tiles);
      for (const w of words) {
        if (!isValidWord(w.word)) {
          res.status(400).json({ error: `"${w.word}" is not a valid word` });
          return;
        }
      }

      // Score the move
      const scoreResult = scoreMove(board, tiles);

      // Update board
      for (const t of tiles) {
        board[t.row][t.col].tile = {
          letter: t.letter,
          points: t.isBlank ? 0 : rack.find(r => r.letter === t.letter)?.points ?? 0,
        };
      }

      // Draw new tiles
      const newRack = [...rackCopy];
      const drawCount = Math.min(tiles.length, tileBag.length);
      for (let i = 0; i < drawCount; i++) {
        newRack.push(tileBag.shift()!);
      }

      // Update scores
      const scoreField = isPlayer1 ? 'player1_score' : 'player2_score';
      const rackField = isPlayer1 ? 'player1_rack' : 'player2_rack';
      const newScore = (isPlayer1 ? g.player1_score : g.player2_score) + scoreResult.totalScore;

      // Check if game is over (player used all tiles and bag is empty)
      let gameOver = false;
      let winnerId = null;
      let p1Score = isPlayer1 ? newScore : g.player1_score;
      let p2Score = isPlayer2 ? newScore : g.player2_score;

      if (newRack.length === 0 && tileBag.length === 0) {
        gameOver = true;
        // Add opponent's remaining tile points to this player's score
        const opponentRack: Tile[] = isPlayer1 ? g.player2_rack : g.player1_rack;
        const opponentTilePoints = opponentRack.reduce((sum: number, t: Tile) => sum + t.points, 0);
        if (isPlayer1) {
          p1Score += opponentTilePoints;
          p2Score -= opponentTilePoints;
        } else {
          p2Score += opponentTilePoints;
          p1Score -= opponentTilePoints;
        }
        winnerId = p1Score > p2Score ? g.player1_id : p2Score > p1Score ? g.player2_id : null;
      }

      // Record move
      await client.query(
        `INSERT INTO moves (game_id, player_id, move_type, tiles_placed, words_formed, score)
         VALUES ($1, $2, 'play', $3, $4, $5)`,
        [g.id, userId, JSON.stringify(tiles), JSON.stringify(scoreResult.wordScores), scoreResult.totalScore],
      );

      // Update game state
      await client.query(
        `UPDATE games SET board_state = $1, tile_bag = $2, ${rackField} = $3,
         player1_score = $4, player2_score = $5, current_turn = $6,
         consecutive_passes = 0, status = $7, winner_id = $8, updated_at = NOW()
         WHERE id = $9`,
        [JSON.stringify(board), JSON.stringify(tileBag), JSON.stringify(newRack),
         p1Score, p2Score, g.current_turn === 1 ? 2 : 1,
         gameOver ? 'finished' : 'active', winnerId, g.id],
      );

      if (gameOver) {
        await updateRatings(client, g.player1_id, g.player2_id, winnerId);
      }

      await client.query('COMMIT');

      // Notify opponent
      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      sendEvent(opponentId, gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id });

      res.json({
        score: scoreResult.totalScore,
        wordScores: scoreResult.wordScores,
        bingo: scoreResult.bingo,
        newRack: newRack,
        gameOver,
      });

    } else if (moveType === 'pass') {
      const newConsecutivePasses = g.consecutive_passes + 1;
      let gameOver = newConsecutivePasses >= MAX_CONSECUTIVE_PASSES;
      let winnerId = null;

      if (gameOver) {
        // Deduct remaining tile points from each player
        const p1Rack: Tile[] = g.player1_rack;
        const p2Rack: Tile[] = g.player2_rack;
        const p1Deduct = p1Rack.reduce((s: number, t: Tile) => s + t.points, 0);
        const p2Deduct = p2Rack.reduce((s: number, t: Tile) => s + t.points, 0);
        const p1Score = g.player1_score - p1Deduct;
        const p2Score = g.player2_score - p2Deduct;
        winnerId = p1Score > p2Score ? g.player1_id : p2Score > p1Score ? g.player2_id : null;

        await client.query(
          `UPDATE games SET current_turn = $1, consecutive_passes = $2,
           player1_score = $3, player2_score = $4, status = 'finished', winner_id = $5, updated_at = NOW()
           WHERE id = $6`,
          [g.current_turn === 1 ? 2 : 1, newConsecutivePasses, p1Score, p2Score, winnerId, g.id],
        );
        await updateRatings(client, g.player1_id, g.player2_id, winnerId);
      } else {
        await client.query(
          `UPDATE games SET current_turn = $1, consecutive_passes = $2, updated_at = NOW() WHERE id = $3`,
          [g.current_turn === 1 ? 2 : 1, newConsecutivePasses, g.id],
        );
      }

      await client.query(
        `INSERT INTO moves (game_id, player_id, move_type, score) VALUES ($1, $2, 'pass', 0)`,
        [g.id, userId],
      );

      await client.query('COMMIT');

      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      sendEvent(opponentId, gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id });
      res.json({ gameOver });

    } else if (moveType === 'exchange') {
      if (!exchangeTiles || exchangeTiles.length === 0) {
        res.status(400).json({ error: 'No tiles to exchange' });
        return;
      }
      if (tileBag.length < exchangeTiles.length) {
        res.status(400).json({ error: 'Not enough tiles in bag' });
        return;
      }

      const newRack = rack.filter((_: Tile, i: number) => !exchangeTiles.includes(i));
      const returned: Tile[] = exchangeTiles.map((i: number) => rack[i]);

      // Draw new tiles
      for (let i = 0; i < exchangeTiles.length; i++) {
        newRack.push(tileBag.shift()!);
      }
      // Put returned tiles back in bag and shuffle
      tileBag.push(...returned);
      for (let i = tileBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tileBag[i], tileBag[j]] = [tileBag[j], tileBag[i]];
      }

      const rackField = isPlayer1 ? 'player1_rack' : 'player2_rack';
      await client.query(
        `UPDATE games SET ${rackField} = $1, tile_bag = $2, current_turn = $3,
         consecutive_passes = consecutive_passes + 1, updated_at = NOW() WHERE id = $4`,
        [JSON.stringify(newRack), JSON.stringify(tileBag), g.current_turn === 1 ? 2 : 1, g.id],
      );

      await client.query(
        `INSERT INTO moves (game_id, player_id, move_type, score) VALUES ($1, $2, 'exchange', 0)`,
        [g.id, userId],
      );

      await client.query('COMMIT');

      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      sendEvent(opponentId, 'opponent_moved', { gameId: g.id });
      res.json({ newRack });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Move error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

// POST /games/:id/resign
router.post('/:id/resign', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const gameResult = await pool.query('SELECT * FROM games WHERE id = $1', [req.params.id]);

  if (gameResult.rows.length === 0) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const g = gameResult.rows[0];
  if (g.status !== 'active') {
    res.status(400).json({ error: 'Game is not active' });
    return;
  }

  const isPlayer1 = g.player1_id === userId;
  const winnerId = isPlayer1 ? g.player2_id : g.player1_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE games SET status = 'finished', winner_id = $1, updated_at = NOW() WHERE id = $2`,
      [winnerId, g.id],
    );
    await updateRatings(client, g.player1_id, g.player2_id, winnerId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
  sendEvent(opponentId, 'game_finished', { gameId: g.id });
  res.json({ ok: true });
});

async function updateRatings(client: any, player1Id: string, player2Id: string, winnerId: string | null) {
  const p1 = await client.query('SELECT rating, rating_deviation, rating_volatility FROM users WHERE id = $1', [player1Id]);
  const p2 = await client.query('SELECT rating, rating_deviation, rating_volatility FROM users WHERE id = $1', [player2Id]);

  const outcome = winnerId === player1Id ? 1 : winnerId === player2Id ? -1 : 0;
  const newRatings = calculateNewRatings(
    { rating: p1.rows[0].rating, deviation: p1.rows[0].rating_deviation, volatility: p1.rows[0].rating_volatility },
    { rating: p2.rows[0].rating, deviation: p2.rows[0].rating_deviation, volatility: p2.rows[0].rating_volatility },
    outcome as 1 | 0 | -1,
  );

  await client.query(
    'UPDATE users SET rating = $1, rating_deviation = $2, rating_volatility = $3 WHERE id = $4',
    [newRatings.player1.rating, newRatings.player1.deviation, newRatings.player1.volatility, player1Id],
  );
  await client.query(
    'UPDATE users SET rating = $1, rating_deviation = $2, rating_volatility = $3 WHERE id = $4',
    [newRatings.player2.rating, newRatings.player2.deviation, newRatings.player2.volatility, player2Id],
  );
}

export default router;
```

**Step 4: Create SSE events route and wire everything into server**

```ts
// Add to packages/server/src/index.ts — after existing routes:
import gameRouter from './routes/games.js';
import { addClient } from './services/sse.js';
import { requireAuth } from './middleware/auth.js';

app.use('/api/games', gameRouter);

// SSE endpoint
app.get('/api/events', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  addClient(req.user!.userId, res);
});
```

**Step 5: Verify server compiles**

Run: `npm run dev:server` (briefly)
Expected: Starts without errors

**Step 6: Commit**

```bash
git add packages/server/src/routes/games.ts packages/server/src/services/matchmaking.ts packages/server/src/services/sse.ts packages/server/src/index.ts
git commit -m "feat: add game API routes, matchmaking, and SSE notifications"
```

---

### Task 9: Client — Auth Pages

**Files:**
- Create: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useAuth.ts`
- Create: `packages/client/src/pages/Login.tsx`
- Create: `packages/client/src/pages/Login.module.css`
- Modify: `packages/client/src/App.tsx`

**Step 1: Create API helper**

```ts
// packages/client/src/api.ts
const BASE = '/api';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}
```

**Step 2: Create auth hook**

```ts
// packages/client/src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';

interface User {
  id: string;
  username: string;
  rating: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginWithPassword = useCallback(async (username: string, password: string) => {
    const user = await apiFetch<User>('/auth/login/password', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(user);
    return user;
  }, []);

  const registerWithPassword = useCallback(async (username: string, password: string) => {
    const user = await apiFetch<User>('/auth/register/password', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return { user, loading, loginWithPassword, registerWithPassword, logout };
}
```

**Step 3: Create Login page**

Create `packages/client/src/pages/Login.tsx` and `Login.module.css` with a form that handles both register and login with username + password. Include passkey stubs that can be wired up later (WebAuthn requires HTTPS so it won't work in local dev without extra setup).

The Login page should have:
- Username input
- Password input
- "Sign In" and "Create Account" buttons
- Error display
- Garden-themed styling (earthy colors)

**Step 4: Update App.tsx with routing**

```tsx
// packages/client/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.js';

export function App() {
  const { user, loading, loginWithPassword, registerWithPassword, logout } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;

  if (!user) {
    return <Login onLogin={loginWithPassword} onRegister={registerWithPassword} />;
  }

  return (
    <BrowserRouter>
      <div>
        <header>
          <span>{user.username} ({Math.round(user.rating)})</span>
          <button onClick={logout}>Sign Out</button>
        </header>
        <Routes>
          <Route path="/" element={<div>Lobby coming next...</div>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
```

**Step 5: Install client deps and verify**

Run: `npm install -w packages/client`
Run: `npm run dev:client` (briefly)
Expected: Vite dev server starts, login page renders

**Step 6: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add client auth pages with login and registration"
```

---

### Task 10: Client — Lobby Page

**Files:**
- Create: `packages/client/src/pages/Lobby.tsx`
- Create: `packages/client/src/pages/Lobby.module.css`
- Create: `packages/client/src/hooks/useSSE.ts`
- Modify: `packages/client/src/App.tsx`

**Step 1: Create SSE hook**

```ts
// packages/client/src/hooks/useSSE.ts
import { useEffect, useRef, useCallback } from 'react';

type EventHandler = (data: any) => void;

export function useSSE(handlers: Record<string, EventHandler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true });

    for (const event of Object.keys(handlersRef.current)) {
      es.addEventListener(event, (e) => {
        const data = JSON.parse(e.data);
        handlersRef.current[event]?.(data);
      });
    }

    return () => es.close();
  }, []);
}
```

**Step 2: Create Lobby page**

The Lobby should show:
- List of active games (cards with opponent name, scores, whose turn)
- "Create Game" button → shows invite code to share
- "Find Match" button → enters matchmaking queue
- "Join Game" input → enter an invite code

**Step 3: Wire Lobby into App.tsx routes**

**Step 4: Verify**

Run: `npm run dev:client`
Expected: After login, lobby page renders with game list and action buttons

**Step 5: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add lobby page with game list and matchmaking"
```

---

### Task 11: Client — Game Board

**Files:**
- Create: `packages/client/src/pages/Game.tsx`
- Create: `packages/client/src/pages/Game.module.css`
- Create: `packages/client/src/components/Board.tsx`
- Create: `packages/client/src/components/Board.module.css`
- Create: `packages/client/src/components/Rack.tsx`
- Create: `packages/client/src/components/Rack.module.css`
- Create: `packages/client/src/components/Tile.tsx`
- Create: `packages/client/src/components/Tile.module.css`
- Create: `packages/client/src/hooks/useGame.ts`
- Modify: `packages/client/src/App.tsx`

This is the core UI. Break into sub-steps:

**Step 1: Create Tile component**

Visual tile with letter and point value. Garden-themed (wooden/stone look).

**Step 2: Create Board component**

15x15 CSS Grid. Premium squares colored distinctly (garden features). Accepts tile placements. Highlights last move.

**Step 3: Create Rack component**

Row of 7 tiles below the board. Tap-to-select on mobile, drag-and-drop on desktop. Shuffle button.

**Step 4: Create useGame hook**

```ts
// packages/client/src/hooks/useGame.ts
// Manages game state: fetches game data, handles tile placement,
// submits moves, listens for SSE updates
```

Responsibilities:
- Fetch game state from `/api/games/:id`
- Track tentative tile placements (before submit)
- Submit moves to `/api/games/:id/move`
- Listen for `opponent_moved` SSE events and refresh

**Step 5: Create Game page**

Composes Board + Rack + Scoreboard + Action buttons. Shows game over overlay when finished.

**Step 6: Add /game/:id route to App.tsx**

**Step 7: Verify**

Run dev server and client, create a game, verify board renders and tiles can be placed.

**Step 8: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add game board UI with tile placement and move submission"
```

---

### Task 12: Client — Garden Theme Styling

**Files:**
- Create: `packages/client/src/styles/theme.css`
- Create: `packages/client/src/styles/global.css`
- Modify: All component CSS modules

**Step 1: Define CSS custom properties for garden theme**

```css
/* packages/client/src/styles/theme.css */
:root {
  --color-bg: #f5f0e8;
  --color-board: #8B7355;
  --color-tile: #DEB887;
  --color-tile-text: #2C1810;
  --color-premium-dw: #E8B4B8;
  --color-premium-tw: #C75B5B;
  --color-premium-dl: #B8D4E8;
  --color-premium-tl: #5B8CC7;
  --color-accent: #6B8E23;
  --color-text: #2C1810;
  --font-main: 'Georgia', serif;
  --font-mono: 'Courier New', monospace;
}
```

**Step 2: Style all components with garden theme**

Apply earthy colors, wooden tile aesthetics, garden feature premium squares. Ensure mobile-first responsive design with 44px minimum tap targets.

**Step 3: Verify on mobile and desktop viewports**

**Step 4: Commit**

```bash
git add packages/client/src/styles/ packages/client/src/**/*.css
git commit -m "feat: add garden theme styling across all components"
```

---

### Task 13: Dockerfile and Docker Compose

**Files:**
- Create: `Dockerfile`
- Modify: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create .dockerignore**

```
node_modules
dist
.env
.git
*.md
```

**Step 2: Create multi-stage Dockerfile**

```dockerfile
# Dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/server/package.json packages/server/
RUN npm ci --omit=dev --workspace=packages/server --workspace=packages/shared
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/data packages/server/data
COPY --from=build /app/packages/server/src/db/migrations packages/server/src/db/migrations
COPY --from=build /app/packages/client/dist packages/client/dist
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
```

**Step 3: Update server to serve static client assets in production**

Add to `packages/server/src/index.ts`:
```ts
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '../../client/dist');

// Serve static client assets in production
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}
```

**Step 4: Build and test Docker image**

Run: `docker compose build app`
Expected: Multi-stage build succeeds

Run: `docker compose up -d`
Expected: Both app and db containers running

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`

**Step 5: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml packages/server/src/index.ts
git commit -m "feat: add Docker build and compose for production deployment"
```

---

### Task 14: E2E Tests

**Files:**
- Create: `packages/client/playwright.config.ts`
- Create: `packages/client/e2e/auth.spec.ts`
- Create: `packages/client/e2e/game.spec.ts`
- Modify: `packages/client/package.json`

**Step 1: Install Playwright**

Run: `npm install -D @playwright/test -w packages/client`
Run: `npx playwright install chromium -w packages/client`

**Step 2: Create Playwright config**

```ts
// packages/client/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'cd ../.. && npm run build && docker compose up -d',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
  },
});
```

**Step 3: Write auth E2E test**

```ts
// packages/client/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test('can register and login with password', async ({ page }) => {
  const username = `test_${Date.now()}`;
  await page.goto('/');
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button:has-text("Create Account")');
  await expect(page.locator('text=' + username)).toBeVisible();
});
```

**Step 4: Write game flow E2E test**

Test: register two users, create game with invite code, join, play a move.

**Step 5: Run E2E tests**

Run: `npm run test:e2e -w packages/client`
Expected: Tests pass

**Step 6: Commit**

```bash
git add packages/client/playwright.config.ts packages/client/e2e/ packages/client/package.json
git commit -m "feat: add E2E tests for auth and game flow"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Project scaffolding | 6 |
| 2 | Shared types and constants | 6 |
| 3 | Database setup and migrations | 7 |
| 4 | Dictionary service | 6 |
| 5 | Game engine — core logic | 5 |
| 6 | Glicko-2 rating service | 5 |
| 7 | Authentication (WebAuthn + password) | 7 |
| 8 | Game API routes | 6 |
| 9 | Client — Auth pages | 6 |
| 10 | Client — Lobby page | 5 |
| 11 | Client — Game board | 8 |
| 12 | Client — Garden theme styling | 4 |
| 13 | Dockerfile and Docker Compose | 5 |
| 14 | E2E tests | 6 |

**Dependencies:** Tasks 1→2→3 are sequential. After 3, tasks 4/5/6 can be parallelized. Task 7 depends on 3. Task 8 depends on 5/6/7. Client tasks 9-12 depend on 8. Task 13 depends on all server+client tasks. Task 14 depends on 13.
