import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api.js';
import { useSSE } from './useSSE.js';
import type { BoardCell, Tile, TilePlacement } from '@word-garden/shared';

export type RackTile = Tile & { _id: number };

interface GameData {
  id: string;
  playerNumber: 1 | 2;
  opponentUsername: string;
  opponentRating: number | null;
  board: BoardCell[][];
  currentTurn: 1 | 2;
  player1Score: number;
  player2Score: number;
  status: string;
  winnerId: string | null;
  rack: Tile[];
  tilesRemaining: number;
  opponentTileCount: number;
  lastMove: {
    playerId: string | null;
    moveType: string;
    tilesPlaced: TilePlacement[];
    wordsFormed: { word: string; score: number }[];
    totalScore: number;
    createdAt: string;
  } | null;
  previousMove: {
    playerId: string | null;
    moveType: string;
    tilesPlaced: TilePlacement[];
    wordsFormed: { word: string; score: number }[];
    totalScore: number;
    createdAt: string;
  } | null;
  ratingChanges: {
    me: { ratingBefore: number; ratingAfter: number; rankBefore: number; rankAfter: number };
    opponent: { ratingBefore: number; ratingAfter: number; rankBefore: number; rankAfter: number };
  } | null;
}

export function useGame(gameId: string, onGameFinished?: () => void) {
  const [game, setGame] = useState<GameData | null>(null);
  const nextTileId = useRef(0);
  const assignIds = useCallback(
    (tiles: Tile[]): RackTile[] => tiles.map(t => ({ ...t, _id: nextTileId.current++ })),
    [],
  );
  const [rack, setRack] = useState<RackTile[]>([]);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [tentativePlacements, setTentativePlacements] = useState<(TilePlacement & { rackIndex: number; originalTile: RackTile })[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingBlankPlacement, setPendingBlankPlacement] = useState<{ row: number; col: number; rackIndex: number; originalTile: RackTile } | null>(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSelection, setExchangeSelection] = useState<Set<number>>(new Set());

  const loadGame = useCallback(async () => {
    try {
      const data = await apiFetch<GameData>(`/games/${gameId}`);
      setGame(data);
      // Only replace rack if tiles actually changed (preserves player's reordering)
      setRack(prev => {
        if (prev.length !== data.rack.length) return assignIds(data.rack);
        const prevCounts = new Map<string, number>();
        for (const t of prev) {
          const key = `${t.letter}:${t.points}`;
          prevCounts.set(key, (prevCounts.get(key) ?? 0) + 1);
        }
        for (const t of data.rack) {
          const key = `${t.letter}:${t.points}`;
          const count = prevCounts.get(key);
          if (count === undefined || count === 0) return assignIds(data.rack);
          prevCounts.set(key, count - 1);
        }
        return prev;
      });
      setTentativePlacements([]);
      setSelectedTileIndex(null);
      setExchangeMode(false);
      setExchangeSelection(new Set());
    } catch (err: any) {
      setError(err.message);
    }
  }, [gameId, assignIds]);

  useEffect(() => { loadGame(); }, [loadGame]);

  useSSE({
    opponent_moved: (data: { gameId: string }) => {
      if (data.gameId === gameId) loadGame();
    },
    game_finished: (data: { gameId: string }) => {
      if (data.gameId === gameId) { loadGame(); onGameFinished?.(); }
    },
  });

  const isMyTurn = game ? game.currentTurn === game.playerNumber : false;

  // Refs for values used as guards in callbacks — avoids recreating callbacks
  // every time game state changes from a server response.
  const gameRef = useRef(game);
  gameRef.current = game;
  const isMyTurnRef = useRef(isMyTurn);
  isMyTurnRef.current = isMyTurn;
  const rackRef = useRef(rack);
  rackRef.current = rack;
  const selectedTileIndexRef = useRef(selectedTileIndex);
  selectedTileIndexRef.current = selectedTileIndex;
  const tentativePlacementsRef = useRef(tentativePlacements);
  tentativePlacementsRef.current = tentativePlacements;

  const placeTile = useCallback((row: number, col: number) => {
    const g = gameRef.current;
    const idx = selectedTileIndexRef.current;
    if (!g || !isMyTurnRef.current || idx === null) return;

    // Can't place on occupied cell
    if (g.board[row][col].tile) return;
    // Can't place where tentative tile already is
    if (tentativePlacementsRef.current.some(t => t.row === row && t.col === col)) return;

    const tile = rackRef.current[idx];

    // Blank tile — prompt for letter choice
    if (tile.letter === '') {
      setPendingBlankPlacement({ row, col, rackIndex: idx, originalTile: tile });
      setSelectedTileIndex(null);
      return;
    }

    setTentativePlacements(prev => [
      ...prev,
      { row, col, letter: tile.letter, isBlank: false, rackIndex: idx, originalTile: tile },
    ]);

    // Remove from available rack tiles
    setRack(prev => prev.filter((_, i) => i !== idx));
    setSelectedTileIndex(null);
  }, []);

  const placeTileFromRack = useCallback((row: number, col: number, rackIndex: number) => {
    const g = gameRef.current;
    if (!g || !isMyTurnRef.current) return;
    if (g.board[row][col].tile) return;
    if (tentativePlacementsRef.current.some(t => t.row === row && t.col === col)) return;

    const tile = rackRef.current[rackIndex];
    if (!tile) return;

    if (tile.letter === '') {
      setPendingBlankPlacement({ row, col, rackIndex, originalTile: tile });
      return;
    }

    setTentativePlacements(prev => [
      ...prev,
      { row, col, letter: tile.letter, isBlank: false, rackIndex, originalTile: tile },
    ]);
    setRack(prev => prev.filter((_, i) => i !== rackIndex));
    setSelectedTileIndex(null);
  }, []);

  const confirmBlankTile = useCallback((letter: string) => {
    if (!pendingBlankPlacement) return;
    const { row, col, rackIndex, originalTile } = pendingBlankPlacement;

    setTentativePlacements(prev => [
      ...prev,
      { row, col, letter, isBlank: true, rackIndex, originalTile },
    ]);
    setRack(prev => prev.filter((_, i) => i !== rackIndex));
    setPendingBlankPlacement(null);
  }, [pendingBlankPlacement]);

  const cancelBlankTile = useCallback(() => {
    setPendingBlankPlacement(null);
  }, []);

  const removeTentative = useCallback((row: number, col: number) => {
    const placement = tentativePlacementsRef.current.find(t => t.row === row && t.col === col);
    if (!placement) return;

    setRack(prev => [...prev, placement.originalTile]);
    setTentativePlacements(prev => prev.filter(t => !(t.row === row && t.col === col)));
  }, []);

  const moveTentative = useCallback((fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    const g = gameRef.current;
    if (!g || !isMyTurnRef.current) return;
    if (g.board[toRow][toCol].tile) return;
    if (tentativePlacementsRef.current.some(t => t.row === toRow && t.col === toCol)) return;

    setTentativePlacements(prev => prev.map(t =>
      t.row === fromRow && t.col === fromCol
        ? { ...t, row: toRow, col: toCol }
        : t
    ));
  }, []);

  const onCellClick = useCallback((row: number, col: number) => {
    // If there's a tentative tile here, remove it
    if (tentativePlacementsRef.current.some(t => t.row === row && t.col === col)) {
      removeTentative(row, col);
      return;
    }
    // Otherwise place selected tile
    placeTile(row, col);
  }, [removeTentative, placeTile]);

  const clearPlacements = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setRack(assignIds(g.rack));
    setTentativePlacements([]);
    setSelectedTileIndex(null);
  }, [assignIds]);

  const reorderRack = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setRack(prev => {
      const next = [...prev];
      const [tile] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, tile);
      return next;
    });
    setSelectedTileIndex(null);
  }, []);

  const shuffleRack = useCallback(() => {
    if (exchangeMode) {
      setExchangeSelection(new Set());
    }
    setRack(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  }, [exchangeMode]);

  const submitMove = useCallback(async () => {
    const placements = tentativePlacementsRef.current;
    if (!gameRef.current || placements.length === 0) return;
    setError('');
    setSubmitting(true);
    try {
      const tiles: TilePlacement[] = placements.map(({ row, col, letter, isBlank }) => ({
        row, col, letter, isBlank,
      }));
      const result = await apiFetch<{ gameOver: boolean }>(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'play', tiles }),
      });
      await loadGame();
      if (result.gameOver) onGameFinished?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [gameId, loadGame, onGameFinished]);

  const pass = useCallback(async () => {
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<{ gameOver: boolean }>(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'pass' }),
      });
      await loadGame();
      if (result.gameOver) onGameFinished?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [gameId, loadGame, onGameFinished]);

  const exchangeTiles = useCallback(async (indices: number[]) => {
    setError('');
    setSubmitting(true);
    try {
      await apiFetch(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'exchange', exchangeTiles: indices }),
      });
      await loadGame();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [gameId, loadGame]);

  const enterExchangeMode = useCallback(() => {
    clearPlacements();
    setExchangeMode(true);
    setExchangeSelection(new Set());
  }, [clearPlacements]);

  const exitExchangeMode = useCallback(() => {
    setExchangeMode(false);
    setExchangeSelection(new Set());
  }, []);

  const toggleExchangeTile = useCallback((index: number) => {
    setExchangeSelection(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const exchangeSelectionRef = useRef(exchangeSelection);
  exchangeSelectionRef.current = exchangeSelection;

  const submitExchange = useCallback(async () => {
    const selection = exchangeSelectionRef.current;
    const g = gameRef.current;
    if (selection.size === 0 || !g) return;
    // Map local rack indices to server-side rack indices.
    // The local rack may have been reordered via drag-and-drop or shuffle,
    // so local indices can differ from the server's rack order.
    const serverRack = g.rack;
    const currentRack = rackRef.current;
    const usedServerIndices = new Set<number>();
    const serverIndices: number[] = [];
    for (const localIdx of selection) {
      const tile = currentRack[localIdx];
      const serverIdx = serverRack.findIndex(
        (t, i) => !usedServerIndices.has(i) && t.letter === tile.letter && t.points === tile.points,
      );
      if (serverIdx !== -1) {
        serverIndices.push(serverIdx);
        usedServerIndices.add(serverIdx);
      }
    }
    await exchangeTiles(serverIndices);
    setExchangeMode(false);
    setExchangeSelection(new Set());
  }, [exchangeTiles]);

  const resign = useCallback(async () => {
    setError('');
    try {
      await apiFetch(`/games/${gameId}/resign`, { method: 'POST' });
      await loadGame();
      onGameFinished?.();
    } catch (err: any) {
      setError(err.message);
    }
  }, [gameId, loadGame, onGameFinished]);

  return {
    game,
    rack,
    selectedTileIndex,
    setSelectedTileIndex,
    tentativePlacements,
    isMyTurn,
    error,
    submitting,
    pendingBlankPlacement,
    confirmBlankTile,
    cancelBlankTile,
    onCellClick,
    placeTileFromRack,
    moveTentative,
    removeTentative,
    clearPlacements,
    shuffleRack,
    reorderRack,
    submitMove,
    pass,
    exchangeMode,
    exchangeSelection,
    enterExchangeMode,
    exitExchangeMode,
    toggleExchangeTile,
    submitExchange,
    resign,
  };
}
