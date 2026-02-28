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
