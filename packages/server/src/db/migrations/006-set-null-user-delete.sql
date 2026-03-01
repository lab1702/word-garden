-- Fix: ON DELETE CASCADE on games.player1_id and games.player2_id destroys
-- opponent game history when a user deletes their account.
-- Change to SET NULL so finished games are preserved for the opponent.

ALTER TABLE games DROP CONSTRAINT games_player1_id_fkey;
ALTER TABLE games ALTER COLUMN player1_id DROP NOT NULL;
ALTER TABLE games ADD CONSTRAINT games_player1_id_fkey
  FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE games DROP CONSTRAINT games_player2_id_fkey;
ALTER TABLE games ADD CONSTRAINT games_player2_id_fkey
  FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE moves ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE moves DROP CONSTRAINT moves_player_id_fkey;
ALTER TABLE moves ADD CONSTRAINT moves_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE SET NULL;
