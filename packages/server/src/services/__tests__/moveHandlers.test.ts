import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createEmptyBoard, RACK_SIZE } from '@word-garden/shared';
import type { Tile, TilePlacement } from '@word-garden/shared';
import { handlePlayMove, handlePassMove, handleExchangeMove } from '../moveHandlers.js';
import { loadDictionary } from '../dictionary.js';

function makeMockClient(): any {
  const calls: { text: string; values: any[] }[] = [];
  return {
    query: vi.fn(async (text: string, values?: any[]) => {
      calls.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 };
    }),
    calls,
  };
}

function makeRack(letters: string): Tile[] {
  return letters.split('').map(l => ({
    letter: l === '_' ? '' : l,
    points: l === '_' ? 0 : 1,
  }));
}

function makeGameRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'game-1',
    player1_id: 'user-1',
    player2_id: 'user-2',
    board_state: createEmptyBoard(),
    tile_bag: makeRack('ABCDEFGHIJKLMNOPQRST'),
    player1_rack: makeRack('ABCDEFG'),
    player2_rack: makeRack('HIJKLMN'),
    player1_score: 0,
    player2_score: 0,
    current_turn: 1,
    consecutive_passes: 0,
    status: 'active',
    ...overrides,
  };
}

describe('moveHandlers', () => {
  beforeAll(async () => {
    await loadDictionary();
  });

  describe('handlePlayMove', () => {
    it('returns error for undefined tiles', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handlePlayMove(client, g, 'user-1', undefined);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tiles' });
    });

    it('returns error for empty tiles array', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handlePlayMove(client, g, 'user-1', []);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tiles' });
    });

    it('returns error for too many tiles', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = Array.from({ length: RACK_SIZE + 1 }, (_, i) => ({
        row: 7, col: i, letter: 'A', isBlank: false,
      }));
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tiles' });
    });

    it('returns error for out-of-bounds row', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = [{ row: -1, col: 7, letter: 'A', isBlank: false }];
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile placement data' });
    });

    it('returns error for out-of-bounds col', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = [{ row: 7, col: 15, letter: 'A', isBlank: false }];
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile placement data' });
    });

    it('returns error for non-integer row', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = [{ row: 7.5, col: 7, letter: 'A', isBlank: false }];
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile placement data' });
    });

    it('returns error for invalid letter', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = [{ row: 7, col: 7, letter: '1', isBlank: false }];
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile placement data' });
    });

    it('returns error for tile not in rack', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = [{ row: 7, col: 7, letter: 'Z', isBlank: false }];
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Tile Z not in your rack' });
    });

    it('returns error when a tile element is null', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handlePlayMove(client, g, 'user-1', [null as any]);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile placement data' });
    });

    it('returns error when a tile element is a number', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handlePlayMove(client, g, 'user-1', [42 as any]);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile placement data' });
    });

    it('succeeds for a valid first word at center', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const tiles: TilePlacement[] = [
        { row: 7, col: 7, letter: 'A', isBlank: false },
        { row: 7, col: 8, letter: 'B', isBlank: false },
      ];
      const result = await handlePlayMove(client, g, 'user-1', tiles);
      expect(result.type).toBe('success');
      if (result.type !== 'success') return;
      expect(result.score).toBeGreaterThan(0);
      expect(result.wordScores).toHaveLength(1);
      expect(result.wordScores[0].word).toBe('AB');
      expect(result.gameOver).toBe(false);
      expect(result.opponentId).toBe('user-2');
      expect(result.newRack).toHaveLength(7);
    });

    it('does not mutate the original game board', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const originalCell = g.board_state[7][7].tile;
      await handlePlayMove(client, g, 'user-1', [{ row: 7, col: 7, letter: 'Z', isBlank: false }]);
      expect(g.board_state[7][7].tile).toBe(originalCell);
    });
  });

  describe('handleExchangeMove', () => {
    it('returns error for undefined exchange tiles', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handleExchangeMove(client, g, 'user-1', undefined);
      expect(result).toEqual({ type: 'error', status: 400, error: 'No tiles to exchange' });
    });

    it('returns error for empty exchange array', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handleExchangeMove(client, g, 'user-1', []);
      expect(result).toEqual({ type: 'error', status: 400, error: 'No tiles to exchange' });
    });

    it('returns error for duplicate indices', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handleExchangeMove(client, g, 'user-1', [0, 0]);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Duplicate tile indices' });
    });

    it('returns error for out-of-range index', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handleExchangeMove(client, g, 'user-1', [10]);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Invalid tile indices' });
    });

    it('returns error for insufficient bag', async () => {
      const client = makeMockClient();
      const g = makeGameRow({ tile_bag: [{ letter: 'X', points: 8 }] });
      const result = await handleExchangeMove(client, g, 'user-1', [0, 1]);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Not enough tiles in bag' });
    });

    it('returns error for too many exchange tiles', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handleExchangeMove(client, g, 'user-1', [0,1,2,3,4,5,6,7]);
      expect(result).toEqual({ type: 'error', status: 400, error: 'Too many tiles to exchange' });
    });

    it('does not mutate the original tile bag', async () => {
      const client = makeMockClient();
      const originalBag = makeRack('ABCDEFGHIJKLMNOPQRST');
      const g = makeGameRow({ tile_bag: originalBag });
      const originalLength = originalBag.length;
      await handleExchangeMove(client, g, 'user-1', [0]);
      expect(g.tile_bag.length).toBe(originalLength);
    });
  });

  describe('handlePassMove', () => {
    it('calls client.query for pass move', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handlePassMove(client, g, 'user-1');
      expect(result.type).toBe('success');
      expect(client.query).toHaveBeenCalled();
    });

    it('returns gameOver false when passes below max', async () => {
      const client = makeMockClient();
      const g = makeGameRow({ consecutive_passes: 0 });
      const result = await handlePassMove(client, g, 'user-1');
      expect(result).toMatchObject({ type: 'success', gameOver: false });
    });

    it('returns correct opponentId for player 1', async () => {
      const client = makeMockClient();
      const g = makeGameRow();
      const result = await handlePassMove(client, g, 'user-1');
      expect(result).toMatchObject({ type: 'success', opponentId: 'user-2' });
    });

    it('returns correct opponentId for player 2', async () => {
      const client = makeMockClient();
      const g = makeGameRow({ current_turn: 2 });
      const result = await handlePassMove(client, g, 'user-2');
      expect(result).toMatchObject({ type: 'success', opponentId: 'user-1' });
    });
  });
});
