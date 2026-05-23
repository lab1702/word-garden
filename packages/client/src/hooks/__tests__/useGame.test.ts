import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../api.js', () => ({ apiFetch: vi.fn() }));
const h = vi.hoisted(() => ({ sseHandlers: {} as Record<string, (data: any) => void> }));
vi.mock('../useSSE.js', () => ({
  useSSE: (handlers: Record<string, (data: any) => void>) => {
    h.sseHandlers = handlers;
    return { connected: true };
  },
}));

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

describe('useGame SSE-triggered reloads', () => {
  it('does not discard in-progress placements on a stale opponent_moved during my turn', async () => {
    const { result } = renderHook(() => useGame('g1'));
    await waitFor(() => expect(result.current.game).not.toBeNull());

    act(() => { result.current.placeTileFromRack(7, 7, 1); }); // place 'A'
    expect(result.current.tentativePlacements).toHaveLength(1);

    // A duplicate/late opponent move arrives while it is already our turn.
    await act(async () => { h.sseHandlers.opponent_moved({ gameId: 'g1' }); });

    expect(result.current.tentativePlacements).toHaveLength(1);
  });
});

describe('useGame rack reorder safety', () => {
  it('ignores a reorder with out-of-range indices (stale drag after the rack shrank)', async () => {
    const { result } = renderHook(() => useGame('g1'));
    await waitFor(() => expect(result.current.game).not.toBeNull());

    expect(result.current.rack).toHaveLength(4);
    act(() => { result.current.reorderRack(5, 0); }); // index 5 no longer exists

    expect(result.current.rack).toHaveLength(4);
    expect(result.current.rack.every(t => t !== undefined)).toBe(true);
  });
});

describe('useGame exchange game-over', () => {
  it('calls onGameFinished when an exchange ends the game', async () => {
    const onFinished = vi.fn();
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.endsWith('/move')) return { gameOver: true } as any;
      return gameData() as any;
    });
    const { result } = renderHook(() => useGame('g1', onFinished));
    await waitFor(() => expect(result.current.game).not.toBeNull());

    act(() => { result.current.enterExchangeMode(); });
    act(() => { result.current.toggleExchangeTile(0); });
    await act(async () => { await result.current.submitExchange(); });

    expect(onFinished).toHaveBeenCalled();
  });
});
