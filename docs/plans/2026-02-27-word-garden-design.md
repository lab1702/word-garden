# Word Garden — Design Document

A web-based word game (Scrabble-style tile placement) with garden-themed visuals, async gameplay, and skill-based matchmaking.

## Core Decisions

- **Gameplay:** Classic 15x15 board, 100-tile bag, standard letter distribution and scoring, premium squares (DL/TL/DW/TW)
- **Turn model:** Asynchronous — players take turns on their own schedule
- **Identity:** Username + passkey (WebAuthn) with optional password fallback. No email or phone required.
- **Rating:** Glicko-2 (rating, deviation, volatility). Default 1500/350/0.06.
- **Dictionary:** ENABLE open-source word list (~173k words)
- **Invites:** Shareable invite codes (e.g. `GARDEN-7X3K`), no friend list
- **Theme:** Garden aesthetic (visual only) — earthy tones, wooden/stone tile markers, flower bed premium squares
- **Anti-cheat:** None
- **Stack:** Full TypeScript — React frontend, Express backend, PostgreSQL
- **Architecture:** Monolithic SPA + REST API with SSE for notifications
- **Deployment:** Docker Compose (app + db), external Caddy for TLS

## Game Engine

### Board

15x15 grid. Premium square layout matches the standard Scrabble pattern:
- Triple Word (TW): corners and mid-edges
- Double Word (DW): diagonals from center
- Triple Letter (TL): scattered
- Double Letter (DL): scattered
- Center star: first word must cross it (acts as DW on first turn)

Board state stored as a 2D array of cells, each with an optional tile and premium type.

### Tiles

100 tiles with standard English distribution:

| Letter | Count | Points |
|--------|-------|--------|
| A      | 9     | 1      |
| B      | 2     | 3      |
| ...    | ...   | ...    |
| Blank  | 2     | 0      |

Full distribution defined in `packages/shared/src/tiles.ts`.

### Turn Flow

1. Active player places tiles from their rack onto the board
2. All placed tiles must be in a single row or column
3. Placed tiles must connect to existing tiles (except first move, which crosses center)
4. Client sends tile placements to server: `[{row, col, letter}]`
5. Server validates: correct player's turn, tiles in player's rack, valid placement geometry, all formed words in dictionary
6. Server scores all words formed (including cross-words), applying premium squares
7. Server draws replacement tiles from the bag, updates game state
8. Turn passes to opponent

### Scoring

- Each word formed scores the sum of tile points, with letter multipliers applied first, then word multipliers
- Premium squares only count the first time they're covered
- Using all 7 tiles in one turn earns a 50-point bonus (bingo)

### Game End

Game ends when:
- Tile bag is empty AND one player plays all remaining tiles (that player gets the sum of the opponent's remaining tile points added to their score)
- Both players pass or exchange 3 consecutive times each
- A player resigns

### Dictionary

ENABLE word list loaded into a `Set<string>` in server memory at startup for O(1) lookup. Words normalized to uppercase.

## Data Model

### User
```
id: uuid (PK)
username: text (unique, 3-20 chars, alphanumeric + underscores)
password_hash: text (nullable, bcrypt)
rating: float (default 1500)
rating_deviation: float (default 350)
rating_volatility: float (default 0.06)
created_at: timestamptz
```

### UserCredential (WebAuthn)
```
id: uuid (PK)
user_id: uuid (FK -> User)
credential_id: text
public_key: bytea
counter: bigint
created_at: timestamptz
```

### Game
```
id: uuid (PK)
player1_id: uuid (FK -> User)
player2_id: uuid (FK -> User, nullable until joined)
board_state: jsonb (15x15 grid)
tile_bag: jsonb (remaining tiles)
player1_rack: jsonb (up to 7 tiles)
player2_rack: jsonb (up to 7 tiles)
current_turn: smallint (1 or 2)
player1_score: int (default 0)
player2_score: int (default 0)
status: text (waiting | active | finished)
winner_id: uuid (FK -> User, nullable)
invite_code: text (nullable, unique, e.g. GARDEN-7X3K)
consecutive_passes: smallint (default 0)
created_at: timestamptz
updated_at: timestamptz
```

### Move
```
id: uuid (PK)
game_id: uuid (FK -> Game)
player_id: uuid (FK -> User)
move_type: text (play | pass | exchange)
tiles_placed: jsonb ([{row, col, letter}])
words_formed: jsonb ([{word, score}])
score: int
created_at: timestamptz
```

### MatchmakingQueue
```
id: uuid (PK)
user_id: uuid (FK -> User, unique)
rating: float
rating_deviation: float
queued_at: timestamptz
```

## API

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Register with username + passkey (WebAuthn) |
| POST | /auth/register/password | Register with username + password fallback |
| POST | /auth/login | Login with passkey |
| POST | /auth/login/password | Login with password |
| POST | /auth/logout | Clear session |
| GET  | /auth/me | Get current user info |

Sessions via HTTP-only secure cookies (JWT or opaque token).

### Games

| Method | Path | Description |
|--------|------|-------------|
| POST | /games | Create a new game (generates invite code) |
| POST | /games/join/:inviteCode | Join a game via invite code |
| POST | /games/matchmake | Enter matchmaking queue |
| DELETE | /games/matchmake | Leave matchmaking queue |
| GET  | /games | List your active/recent games |
| GET  | /games/:id | Get game state (opponent's rack hidden) |
| POST | /games/:id/move | Submit a move (play, pass, or exchange) |
| POST | /games/:id/resign | Resign the game |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | /events | SSE stream for real-time events |

Events: `game_started`, `opponent_moved`, `game_finished`, `match_found`.

### Matchmaking

When a player enters the queue, the server checks for a match:
- Rating range: `+/-(100 + seconds_waiting * 2)`
- Checked every 5 seconds or when a new player joins the queue
- On match: create game, notify both players via SSE, remove from queue

## Frontend

### Tech

React + TypeScript, Vite bundler, CSS modules (no component library), mobile-first responsive design.

### Screens

1. **Login/Register** — username field, "Sign in with passkey" primary CTA, "Use password" secondary link
2. **Lobby** — active game cards (opponent, score, whose turn), "New Game" button (invite link or matchmake), username + rating display
3. **Game Board** — 15x15 CSS Grid board, tile rack below, scoreboard, action buttons (submit, shuffle, exchange, pass), last move highlighted
4. **Game Over** — final scores, Glicko-2 rating change display, "Play again" / "Back to lobby"

### Responsive Design

- Mobile: board fills viewport width, rack below, minimum 44px tap targets
- Desktop: board centered, scoreboard alongside
- Touch: tap-to-select tile, tap-to-place on board
- Mouse: drag-and-drop tiles from rack to board

### Garden Theme

- Earthy palette: greens, browns, warm tans
- Tiles: wooden or stone marker aesthetic
- Premium squares: styled as garden features (flower beds, fountains, trellises)
- Board: garden bed / planter box feel

## Project Structure

```
word-garden/
├── packages/
│   ├── client/              # React SPA
│   │   ├── src/
│   │   │   ├── components/  # Board, Rack, Tile, Lobby, etc.
│   │   │   ├── hooks/       # useGame, useAuth, useSSE
│   │   │   ├── pages/       # Login, Lobby, Game, GameOver
│   │   │   ├── styles/      # CSS modules, theme variables
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── server/              # Express API
│   │   ├── src/
│   │   │   ├── routes/      # auth, games, events
│   │   │   ├── services/    # gameEngine, matchmaking, glicko2, dictionary
│   │   │   ├── db/          # migrations, queries
│   │   │   ├── middleware/  # auth, validation
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── shared/              # Shared types & constants
│       └── src/
│           ├── types.ts     # Game, User, Move, etc.
│           ├── tiles.ts     # Letter distribution, point values
│           └── board.ts     # Premium square layout
├── Dockerfile               # Multi-stage: build client + server
├── docker-compose.yml       # app + db services
├── package.json             # Workspace root (npm workspaces)
└── tsconfig.base.json
```

## Deployment

**Docker Compose** with two services:

- `app` — Multi-stage Dockerfile: stage 1 builds client (Vite), stage 2 builds server (tsc), stage 3 runs server (serves static client assets + API). Exposes port 3000.
- `db` — PostgreSQL 16. Named volume for data persistence. Migrations run on app startup.

**External Caddy** (already on host) reverse-proxies to `app:3000` with automatic TLS.

## Testing

- **Unit tests (Vitest):** Game engine (tile placement validation, scoring, word checking), Glicko-2 calculations, matchmaking logic
- **E2E tests (Playwright):** Register, create game, join via invite, play a move, complete a game
