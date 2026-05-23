-- Replace the single-column leaderboard index with a composite that matches
-- the new (rating DESC, id ASC) ordering used by the leaderboard and rank query.
DROP INDEX IF EXISTS idx_users_leaderboard;
CREATE INDEX idx_users_leaderboard ON users (rating DESC, id) WHERE rating_deviation < 350;
