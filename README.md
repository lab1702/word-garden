# Word Garden

A web-based multiplayer word game. Players take turns placing letter tiles on a 15x15 board to form words, Scrabble-style. Features passkey and password authentication, Glicko-2 matchmaking, and real-time notifications.

## Tech Stack

- **Frontend:** React 19, Vite 6, React Router 7, CSS Modules
- **Backend:** Express 5, TypeScript, Node 22
- **Database:** PostgreSQL 18
- **Auth:** Password (bcrypt) + WebAuthn passkeys, JWT sessions
- **Deployment:** Docker, multi-stage build

## Project Structure

```
packages/
├── shared/     # Shared types, board layout, tile definitions
├── server/     # Express API, game engine, matchmaking
│   ├── src/
│   │   ├── db/           # Migrations and connection pool
│   │   ├── routes/       # Auth and game API endpoints
│   │   ├── services/     # Dictionary, game engine, Glicko-2, SSE
│   │   └── middleware/   # JWT auth middleware
│   └── data/             # Dictionary word list (enable.txt)
└── client/     # React SPA
    ├── src/
    │   ├── components/   # Board, Rack, Tile
    │   ├── pages/        # Login, Lobby, Game
    │   ├── hooks/        # Auth and game state hooks
    │   └── styles/       # Theme and global styles
    └── e2e/              # Playwright tests
```

## Quick Start (Docker)

The simplest way to run Word Garden:

```bash
docker compose up -d
```

The app will be available at **http://localhost:9000**.

This starts two containers:
- `app` — the Node.js server serving both the API and the built client
- `db` — PostgreSQL 18 with a persistent named volume (`pgdata`)

Database migrations run automatically on server startup.

### Rebuild After Code Changes

```bash
docker compose build --no-cache && docker compose up -d --force-recreate
```

## Local Development (Without Docker)

### Prerequisites

- Node.js 22+
- PostgreSQL 18+
- npm

### Database Setup

Create a PostgreSQL database:

```bash
createdb wordgarden
createuser wordgarden -P  # set password to: wordgarden_dev
```

Or use the Docker database only:

```bash
docker compose up db -d
```

### Install and Run

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env if your database credentials differ

# Build shared types (required first)
npm run build -w packages/shared

# Run server and client in separate terminals:
npm run dev:server    # Express on port 3000
npm run dev:client    # Vite dev server on port 5173 (proxies API to 3000)
```

The Vite dev server proxies `/api` and `/events` requests to the Express server automatically.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden` |
| `SESSION_SECRET` | Secret for signing JWT tokens | `dev-secret-change-in-production` |
| `RP_ID` | WebAuthn relying party ID (your domain) | `localhost` |
| `RP_NAME` | WebAuthn relying party display name | `Word Garden` |
| `ORIGIN` | Full origin URL for WebAuthn and CORS | `http://localhost:5173` |
| `VITE_BASE_PATH` | Subpath prefix for serving behind a reverse proxy (build-time only) | _(empty)_ |

For production, set `SESSION_SECRET` to a strong random value and update `RP_ID`, `RP_NAME`, and `ORIGIN` to match your domain.

## Database Administration

### Reset the Database Completely

Remove the Docker volume to destroy all data and start fresh:

```bash
docker compose down -v
docker compose up -d
```

The `-v` flag removes the `pgdata` volume. Migrations will re-run on the next startup, creating all tables from scratch.

### Reset Without Docker

```bash
dropdb wordgarden
createdb wordgarden
# Restart the server — migrations run automatically
```

### Connect to the Database Directly

```bash
# Via Docker
docker compose exec db psql -U wordgarden

# Local
psql -U wordgarden -d wordgarden
```

### Useful Queries

```sql
-- List all users
SELECT id, username, rating, rating_deviation, created_at FROM users;

-- Active games
SELECT id, status, invite_code, player1_id, player2_id, current_turn
FROM games WHERE status IN ('waiting', 'active');

-- Delete a specific user (cascades to their games)
DELETE FROM users WHERE username = 'somename';

-- See migration history
SELECT * FROM _migrations ORDER BY applied_at;
```

### Adding a New Migration

Create a new `.sql` file in `packages/server/src/db/migrations/` with a numeric prefix:

```
002-add-some-feature.sql
```

Migrations run in alphabetical order. Each migration runs inside a transaction. The migration runner tracks which files have already been applied in the `_migrations` table and skips them.

## Testing

### Unit Tests

Server-side tests cover the dictionary, game engine, and Glicko-2 rating system:

```bash
npm test              # Run once
npm run test:watch -w packages/server   # Watch mode
```

### End-to-End Tests

E2E tests use Playwright and require the app to be running via Docker:

```bash
docker compose up -d

# Install browsers (first time only)
npx playwright install --with-deps

npm run test:e2e
```

## Port Configuration

The Docker setup maps port **9000** on the host to port **3000** inside the container. To change the external port, edit `docker-compose.yml`:

```yaml
app:
  ports:
    - "YOUR_PORT:3000"
  environment:
    ORIGIN: http://localhost:YOUR_PORT
```

## Production Deployment

1. Set strong values for `SESSION_SECRET` and update `RP_ID`, `ORIGIN` to your domain
2. Use a managed PostgreSQL instance and update `DATABASE_URL`
3. Put a reverse proxy (nginx, Caddy) in front for TLS termination
4. The Docker image is self-contained — it serves both the API and static client assets on port 3000

### Serving at a Subpath

To serve the app at a subpath (e.g. `https://example.com/word/`), set `VITE_BASE_PATH` at build time. The reverse proxy should strip the prefix before forwarding to the app.

The default `docker-compose.yml` builds with `VITE_BASE_PATH=/word`. To change or remove it:

```yaml
app:
  build:
    context: .
    args:
      VITE_BASE_PATH: /your-path   # or "" for root
```

Example Caddy config:

```
example.com {
    handle_path /word/* {
        reverse_proxy app:3000
    }
}
```

`handle_path` strips the `/word` prefix, so the server receives clean `/api/...` paths. No server-side changes are needed — only the client build is affected.
