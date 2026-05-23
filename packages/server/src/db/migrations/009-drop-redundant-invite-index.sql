-- The UNIQUE constraint on games.invite_code (migration 001) already creates an
-- implicit unique B-tree index, so the explicit idx_games_invite_code is a
-- redundant duplicate that only adds write/storage overhead on the games table.
DROP INDEX IF EXISTS idx_games_invite_code;
