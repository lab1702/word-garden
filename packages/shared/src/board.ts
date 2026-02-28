import type { Board, BoardCell, CellPremium } from './types.js';

export const BOARD_SIZE = 15;
export const CENTER = 7;
export const MAX_CONSECUTIVE_PASSES = 6; // 3 per player

// Premium square positions (using symmetry - define one quadrant + axes)
const PREMIUM_MAP: Record<string, CellPremium> = {};

function setSymmetric(row: number, col: number, premium: CellPremium) {
  const positions = [
    [row, col], [row, 14 - col], [14 - row, col], [14 - row, 14 - col],
    [col, row], [col, 14 - row], [14 - col, row], [14 - col, 14 - row],
  ];
  for (const [r, c] of positions) {
    PREMIUM_MAP[`${r},${c}`] = premium;
  }
}

// Triple Word
setSymmetric(0, 0, 'TW');
setSymmetric(0, 7, 'TW');

// Double Word
setSymmetric(1, 1, 'DW');
setSymmetric(2, 2, 'DW');
setSymmetric(3, 3, 'DW');
setSymmetric(4, 4, 'DW');
PREMIUM_MAP['7,7'] = 'DW'; // center star

// Triple Letter
setSymmetric(1, 5, 'TL');
setSymmetric(5, 5, 'TL');

// Double Letter
setSymmetric(0, 3, 'DL');
setSymmetric(2, 6, 'DL');
setSymmetric(3, 7, 'DL');
setSymmetric(6, 6, 'DL');

export function getPremium(row: number, col: number): CellPremium {
  return PREMIUM_MAP[`${row},${col}`] ?? null;
}

export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowCells: BoardCell[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      rowCells.push({ tile: null, premium: getPremium(row, col) });
    }
    board.push(rowCells);
  }
  return board;
}
