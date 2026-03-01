import type { Board, Tile, GameStatus } from '@word-garden/shared';

export type { PoolClient } from 'pg';

export interface GameRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  board_state: Board;
  tile_bag: Tile[];
  player1_rack: Tile[];
  player2_rack: Tile[];
  current_turn: 1 | 2;
  player1_score: number;
  player2_score: number;
  status: GameStatus;
  winner_id: string | null;
  invite_code: string | null;
  consecutive_passes: number;
  created_at: Date;
  updated_at: Date;
}
