import { describe, it, expect, beforeAll } from 'vitest';
import { createEmptyBoard, BOARD_SIZE } from '@word-garden/shared';
import type { Board, TilePlacement } from '@word-garden/shared';
import { findFormedWords, validatePlacement, scoreMove, initializeGame } from '../gameEngine.js';
import { loadDictionary } from '../dictionary.js';

function placeTileOnBoard(board: Board, row: number, col: number, letter: string, points: number): Board {
  const newBoard = board.map(r => r.map(c => ({ ...c })));
  newBoard[row][col] = { ...newBoard[row][col], tile: { letter, points } };
  return newBoard;
}

describe('gameEngine', () => {
  beforeAll(async () => {
    await loadDictionary();
  });

  describe('validatePlacement', () => {
    it('rejects empty placement', () => {
      const board = createEmptyBoard();
      const result = validatePlacement(board, [], true);
      expect(result.valid).toBe(false);
    });

    it('accepts a valid first move through center', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 5, letter: 'H', isBlank: false },
        { row: 7, col: 6, letter: 'E', isBlank: false },
        { row: 7, col: 7, letter: 'L', isBlank: false },
        { row: 7, col: 8, letter: 'L', isBlank: false },
        { row: 7, col: 9, letter: 'O', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, true);
      expect(result.valid).toBe(true);
    });

    it('rejects first move not through center', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 0, col: 0, letter: 'H', isBlank: false },
        { row: 0, col: 1, letter: 'I', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, true);
      expect(result.valid).toBe(false);
    });

    it('rejects tiles not in a line', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 7, letter: 'A', isBlank: false },
        { row: 8, col: 8, letter: 'B', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, true);
      expect(result.valid).toBe(false);
    });

    it('accepts tiles with gaps filled by existing tiles', () => {
      let board = createEmptyBoard();
      // Place "HI" on the board first
      board = placeTileOnBoard(board, 7, 7, 'H', 4);
      board = placeTileOnBoard(board, 7, 8, 'I', 1);
      // Now place "S" extending to "HIS"
      const tiles: TilePlacement[] = [
        { row: 7, col: 9, letter: 'S', isBlank: false },
      ];
      const result = validatePlacement(board, tiles, false);
      expect(result.valid).toBe(true);
    });
  });

  describe('findFormedWords', () => {
    it('finds horizontal word on first move', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 6, letter: 'H', isBlank: false },
        { row: 7, col: 7, letter: 'I', isBlank: false },
      ];
      const words = findFormedWords(board, tiles);
      expect(words).toHaveLength(1);
      expect(words[0].word).toBe('HI');
    });

    it('finds cross-words when extending', () => {
      let board = createEmptyBoard();
      board = placeTileOnBoard(board, 7, 7, 'H', 4);
      board = placeTileOnBoard(board, 7, 8, 'I', 1);
      // Place "A" below "H" to form "HA" vertically
      const tiles: TilePlacement[] = [
        { row: 8, col: 7, letter: 'A', isBlank: false },
      ];
      const words = findFormedWords(board, tiles);
      expect(words.some(w => w.word === 'HA')).toBe(true);
    });
  });

  describe('scoreMove', () => {
    it('scores a simple word correctly', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 6, letter: 'H', isBlank: false },
        { row: 7, col: 7, letter: 'I', isBlank: false },
      ];
      const score = scoreMove(board, tiles);
      // H=4, I=1, center square is DW, so (4+1)*2 = 10
      expect(score.totalScore).toBe(10);
    });

    it('applies bingo bonus for 7 tiles', () => {
      const board = createEmptyBoard();
      const tiles: TilePlacement[] = [
        { row: 7, col: 4, letter: 'G', isBlank: false },
        { row: 7, col: 5, letter: 'A', isBlank: false },
        { row: 7, col: 6, letter: 'R', isBlank: false },
        { row: 7, col: 7, letter: 'D', isBlank: false },
        { row: 7, col: 8, letter: 'E', isBlank: false },
        { row: 7, col: 9, letter: 'N', isBlank: false },
        { row: 7, col: 10, letter: 'S', isBlank: false },
      ];
      const score = scoreMove(board, tiles);
      // Should include 50-point bingo bonus
      expect(score.totalScore).toBeGreaterThanOrEqual(50);
      expect(score.bingo).toBe(true);
    });
  });

  describe('initializeGame', () => {
    it('creates a game with full tile bag minus two racks', () => {
      const game = initializeGame();
      expect(game.board).toHaveLength(15);
      expect(game.player1Rack).toHaveLength(7);
      expect(game.tileBag).toHaveLength(100 - 7); // 93 tiles remain
      expect(game.currentTurn).toBe(1);
      expect(game.player1Score).toBe(0);
    });
  });
});
