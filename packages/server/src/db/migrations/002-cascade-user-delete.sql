-- NOTE: The CASCADE behavior for games.player1_id, games.player2_id, and
-- moves.player_id is superseded by migration 006 (ON DELETE SET NULL).
-- This migration still applies to matchmaking_queue.user_id (CASCADE).
--
-- Original description:
-- Allow deleting a user to cascade-delete all their games, moves, and queue entries

ALTER TABLE games DROP CONSTRAINT games_player1_id_fkey;
ALTER TABLE games ADD CONSTRAINT games_player1_id_fkey
  FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE games DROP CONSTRAINT games_player2_id_fkey;
ALTER TABLE games ADD CONSTRAINT games_player2_id_fkey
  FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE games DROP CONSTRAINT games_winner_id_fkey;
ALTER TABLE games ADD CONSTRAINT games_winner_id_fkey
  FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE moves DROP CONSTRAINT moves_player_id_fkey;
ALTER TABLE moves ADD CONSTRAINT moves_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE matchmaking_queue DROP CONSTRAINT matchmaking_queue_user_id_fkey;
ALTER TABLE matchmaking_queue ADD CONSTRAINT matchmaking_queue_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
