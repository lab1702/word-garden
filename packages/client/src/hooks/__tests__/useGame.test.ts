import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../api.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../useSSE.js', () => ({ useSSE: () => {} }));

import { useGame } from '../useGame.js';
import { apiFetch } from '../../api.js';

function emptyBoard() {
  return Array.from({ length: 15 }, () =>
    Array.from({ length: 15 }, () => ({ tile: null })),
  );
}

function gameData() {
  return {
    id: 'g1', playerNumber: 1, opponentUsername: 'bob', opponentRating: 1500,
    board: emptyBoard(), currentTurn: 1, player1Score: 0, player2Score: 0,
    status: 'active', winnerId: null,
    rack: [
      { letter: '', points: 0 },   // blank
      { letter: 'A', points: 1 },
      { letter: 'B', points: 3 },
      { letter: 'C', points: 3 },
    ],
    tilesRemaining: 50, opponentTileCount: 7,
    lastMove: null, previousMove: null, ratingChanges: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue(gameData());
});

describe('useGame blank tile placement', () => {
  it('removes the correct (blank) tile even after the rack is reordered', async () => {
    const { result } = renderHook(() => useGame('g1'));
    await waitFor(() => expect(result.current.game).not.toBeNull());

    // Place the blank (index 0) on the center cell -> opens the blank picker.
    act(() => { result.current.placeTileFromRack(7, 7, 0); });
    // Reorder the rack so index 0 no longer points at the blank.
    act(() => { result.current.reorderRack(0, 3); });
    // Confirm the blank as 'Q'.
    act(() => { result.current.confirmBlankTile('Q'); });

    // The blank must be gone from the rack and present as a tentative placement.
    expect(result.current.rack.some(t => t.letter === '')).toBe(false);
    expect(result.current.rack).toHaveLength(3);
    expect(result.current.tentativePlacements).toEqual([
      expect.objectContaining({ row: 7, col: 7, letter: 'Q', isBlank: true }),
    ]);
  });
});
