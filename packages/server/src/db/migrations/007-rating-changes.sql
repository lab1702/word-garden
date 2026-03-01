ALTER TABLE games
  ADD COLUMN player1_rating_before DOUBLE PRECISION,
  ADD COLUMN player1_rating_after DOUBLE PRECISION,
  ADD COLUMN player2_rating_before DOUBLE PRECISION,
  ADD COLUMN player2_rating_after DOUBLE PRECISION,
  ADD COLUMN player1_rank_before INT,
  ADD COLUMN player1_rank_after INT,
  ADD COLUMN player2_rank_before INT,
  ADD COLUMN player2_rank_after INT;
