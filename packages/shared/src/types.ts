export interface Tile {
  letter: string; // A-Z or '' for blank
  points: number;
}

export interface PlacedTile extends Tile {
  row: number;
  col: number;
  isBlank: boolean; // true if this tile was a blank assigned a letter
}

export type CellPremium = 'DL' | 'TL' | 'DW' | 'TW' | null;

export interface BoardCell {
  tile: Tile | null;
  premium: CellPremium;
}

export type Board = BoardCell[][];

export interface TilePlacement {
  row: number;
  col: number;
  letter: string;
  isBlank: boolean;
}

export type MoveType = 'play' | 'pass' | 'exchange';
export type GameStatus = 'waiting' | 'active' | 'finished';

export interface GameState {
  id: string;
  player1Id: string;
  player2Id: string | null;
  board: Board;
  currentTurn: 1 | 2;
  player1Score: number;
  player2Score: number;
  status: GameStatus;
  winnerId: string | null;
  inviteCode: string | null;
  consecutivePasses: number;
  // Racks and tile bag are server-only (not sent to opponent)
}

export interface PlayerGameView extends Omit<GameState, 'player1Id' | 'player2Id'> {
  playerNumber: 1 | 2;
  opponentUsername: string;
  rack: Tile[];
  tilesRemaining: number;
  lastMove: MoveRecord | null;
}

export interface MoveRecord {
  playerId: string;
  moveType: MoveType;
  tilesPlaced: TilePlacement[];
  wordsFormed: { word: string; score: number }[];
  totalScore: number;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  rating: number;
}

export interface UserPrivate extends UserPublic {
  ratingDeviation: number;
}

export interface GameSummary {
  id: string;
  opponentUsername: string;
  opponentRating: number;
  playerScore: number;
  opponentScore: number;
  isYourTurn: boolean;
  status: GameStatus;
  updatedAt: string;
}
