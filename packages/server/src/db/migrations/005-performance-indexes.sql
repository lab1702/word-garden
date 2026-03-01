CREATE INDEX idx_users_leaderboard ON users(rating DESC) WHERE rating_deviation < 350;
CREATE INDEX idx_moves_game_created ON moves(game_id, created_at DESC);
