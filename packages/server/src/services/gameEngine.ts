import {
  createEmptyBoard, BOARD_SIZE, CENTER, MAX_CONSECUTIVE_PASSES,
  createTileBag, shuffleBag, RACK_SIZE, BINGO_BONUS,
} from '@word-garden/shared';
import type { Board, Tile, TilePlacement, CellPremium } from '@word-garden/shared';
import { isValidWord } from './dictionary.js';

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface WordFound {
  word: string;
  cells: { row: number; col: number; letter: string; points: number; premium: CellPremium; isNew: boolean }[];
}

interface ScoreResult {
  totalScore: number;
  wordScores: { word: string; score: number }[];
  bingo: boolean;
}

interface GameInit {
  board: Board;
  tileBag: Tile[];
  player1Rack: Tile[];
  currentTurn: 1 | 2;
  player1Score: number;
  player2Score: number;
}

export function initializeGame(player1Id: string): GameInit {
  const board = createEmptyBoard();
  let tileBag = shuffleBag(createTileBag());
  const player1Rack = tileBag.splice(0, RACK_SIZE);
  return {
    board,
    tileBag,
    player1Rack,
    currentTurn: 1,
    player1Score: 0,
    player2Score: 0,
  };
}

export function drawTilesForPlayer2(tileBag: Tile[]): { rack: Tile[]; remainingBag: Tile[] } {
  const bag = [...tileBag];
  const rack = bag.splice(0, RACK_SIZE);
  return { rack, remainingBag: bag };
}

export function validatePlacement(board: Board, tiles: TilePlacement[], isFirstMove: boolean): ValidationResult {
  if (tiles.length === 0) {
    return { valid: false, error: 'No tiles placed' };
  }

  // Check all positions are within bounds and unoccupied
  for (const t of tiles) {
    if (t.row < 0 || t.row >= BOARD_SIZE || t.col < 0 || t.col >= BOARD_SIZE) {
      return { valid: false, error: 'Tile out of bounds' };
    }
    if (board[t.row][t.col].tile !== null) {
      return { valid: false, error: 'Cell already occupied' };
    }
  }

  // Check for duplicate positions
  const posSet = new Set(tiles.map(t => `${t.row},${t.col}`));
  if (posSet.size !== tiles.length) {
    return { valid: false, error: 'Duplicate positions' };
  }

  // Check all tiles in same row or same column
  const rows = new Set(tiles.map(t => t.row));
  const cols = new Set(tiles.map(t => t.col));
  const isHorizontal = rows.size === 1;
  const isVertical = cols.size === 1;

  if (!isHorizontal && !isVertical) {
    return { valid: false, error: 'Tiles must be in a single row or column' };
  }

  // For single tile, both are true — that's fine

  // Check continuity (no gaps unless filled by existing tiles)
  if (isHorizontal) {
    const row = tiles[0].row;
    const minCol = Math.min(...tiles.map(t => t.col));
    const maxCol = Math.max(...tiles.map(t => t.col));
    for (let col = minCol; col <= maxCol; col++) {
      const isNewTile = posSet.has(`${row},${col}`);
      const isExisting = board[row][col].tile !== null;
      if (!isNewTile && !isExisting) {
        return { valid: false, error: 'Gap in tile placement' };
      }
    }
  } else {
    const col = tiles[0].col;
    const minRow = Math.min(...tiles.map(t => t.row));
    const maxRow = Math.max(...tiles.map(t => t.row));
    for (let row = minRow; row <= maxRow; row++) {
      const isNewTile = posSet.has(`${row},${col}`);
      const isExisting = board[row][col].tile !== null;
      if (!isNewTile && !isExisting) {
        return { valid: false, error: 'Gap in tile placement' };
      }
    }
  }

  // First move must cross center
  if (isFirstMove) {
    const crossesCenter = tiles.some(t => t.row === CENTER && t.col === CENTER);
    if (!crossesCenter) {
      return { valid: false, error: 'First move must cross the center square' };
    }
  } else {
    // Must be adjacent to at least one existing tile
    let touchesExisting = false;
    for (const t of tiles) {
      const neighbors = [
        [t.row - 1, t.col], [t.row + 1, t.col],
        [t.row, t.col - 1], [t.row, t.col + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
          if (board[nr][nc].tile !== null && !posSet.has(`${nr},${nc}`)) {
            touchesExisting = true;
            break;
          }
        }
      }
      if (touchesExisting) break;
    }
    if (!touchesExisting) {
      return { valid: false, error: 'Tiles must connect to existing tiles' };
    }
  }

  return { valid: true };
}

export function findFormedWords(board: Board, tiles: TilePlacement[]): WordFound[] {
  // Create a temporary board with the new tiles placed
  const tempBoard = board.map(r => r.map(c => ({ ...c })));
  const newPositions = new Set(tiles.map(t => `${t.row},${t.col}`));

  for (const t of tiles) {
    tempBoard[t.row][t.col] = {
      ...tempBoard[t.row][t.col],
      tile: { letter: t.letter, points: t.isBlank ? 0 : getLetterPoints(t.letter) },
    };
  }

  const words: WordFound[] = [];
  const wordsSeen = new Set<string>(); // avoid duplicates

  function extractWord(startRow: number, startCol: number, dRow: number, dCol: number): WordFound | null {
    const cells: WordFound['cells'] = [];
    let row = startRow;
    let col = startCol;

    while (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && tempBoard[row][col].tile) {
      const cell = tempBoard[row][col];
      cells.push({
        row, col,
        letter: cell.tile!.letter,
        points: cell.tile!.points,
        premium: cell.premium,
        isNew: newPositions.has(`${row},${col}`),
      });
      row += dRow;
      col += dCol;
    }

    if (cells.length < 2) return null;
    const word = cells.map(c => c.letter).join('');
    const key = `${cells[0].row},${cells[0].col},${dRow},${dCol}`;
    if (wordsSeen.has(key)) return null;
    wordsSeen.add(key);
    return { word, cells };
  }

  // For each new tile, find words in both directions
  for (const t of tiles) {
    // Horizontal: find start of word
    let startCol = t.col;
    while (startCol > 0 && tempBoard[t.row][startCol - 1].tile) startCol--;
    const hWord = extractWord(t.row, startCol, 0, 1);
    if (hWord) words.push(hWord);

    // Vertical: find start of word
    let startRow = t.row;
    while (startRow > 0 && tempBoard[startRow - 1][t.col].tile) startRow--;
    const vWord = extractWord(startRow, t.col, 1, 0);
    if (vWord) words.push(vWord);
  }

  return words;
}

export function scoreMove(board: Board, tiles: TilePlacement[]): ScoreResult {
  const words = findFormedWords(board, tiles);
  let totalScore = 0;
  const wordScores: { word: string; score: number }[] = [];

  for (const w of words) {
    let wordScore = 0;
    let wordMultiplier = 1;

    for (const cell of w.cells) {
      let letterScore = cell.points;

      // Premiums only apply to newly placed tiles
      if (cell.isNew) {
        switch (cell.premium) {
          case 'DL': letterScore *= 2; break;
          case 'TL': letterScore *= 3; break;
          case 'DW': wordMultiplier *= 2; break;
          case 'TW': wordMultiplier *= 3; break;
        }
      }

      wordScore += letterScore;
    }

    wordScore *= wordMultiplier;
    totalScore += wordScore;
    wordScores.push({ word: w.word, score: wordScore });
  }

  const bingo = tiles.length === RACK_SIZE;
  if (bingo) {
    totalScore += BINGO_BONUS;
  }

  return { totalScore, wordScores, bingo };
}

function getLetterPoints(letter: string): number {
  const points: Record<string, number> = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
    J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
    S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };
  return points[letter.toUpperCase()] ?? 0;
}
