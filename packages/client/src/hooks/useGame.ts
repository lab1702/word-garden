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

  const placeTile = useCallback((row: number, col: number) => {
    if (!game || !isMyTurn || selectedTileIndex === null) return;

    // Can't place on occupied cell
    if (game.board[row][col].tile) return;
    // Can't place where tentative tile already is
    if (tentativePlacements.some(t => t.row === row && t.col === col)) return;

    const tile = rack[selectedTileIndex];

    // Blank tile — prompt for letter choice
    if (tile.letter === '') {
      setPendingBlankPlacement({ row, col, rackIndex: selectedTileIndex, originalTile: tile });
      setSelectedTileIndex(null);
      return;
    }

    setTentativePlacements(prev => [
      ...prev,
      { row, col, letter: tile.letter, isBlank: false, rackIndex: selectedTileIndex, originalTile: tile },
    ]);

    // Remove from available rack tiles
    setRack(prev => prev.filter((_, i) => i !== selectedTileIndex));
    setSelectedTileIndex(null);
  }, [game, isMyTurn, selectedTileIndex, rack, tentativePlacements]);

  const placeTileFromRack = useCallback((row: number, col: number, rackIndex: number) => {
    if (!game || !isMyTurn) return;
    if (game.board[row][col].tile) return;
    if (tentativePlacements.some(t => t.row === row && t.col === col)) return;

    const tile = rack[rackIndex];
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
  }, [game, isMyTurn, rack, tentativePlacements]);

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
    const placement = tentativePlacements.find(t => t.row === row && t.col === col);
    if (!placement) return;

    setRack(prev => [...prev, placement.originalTile]);
    setTentativePlacements(prev => prev.filter(t => !(t.row === row && t.col === col)));
  }, [tentativePlacements]);

  const moveTentative = useCallback((fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    if (!game || !isMyTurn) return;
    if (game.board[toRow][toCol].tile) return;
    if (tentativePlacements.some(t => t.row === toRow && t.col === toCol)) return;

    setTentativePlacements(prev => prev.map(t =>
      t.row === fromRow && t.col === fromCol
        ? { ...t, row: toRow, col: toCol }
        : t
    ));
  }, [game, isMyTurn, tentativePlacements]);

  const onCellClick = useCallback((row: number, col: number) => {
    // If there's a tentative tile here, remove it
    if (tentativePlacements.some(t => t.row === row && t.col === col)) {
      removeTentative(row, col);
      return;
    }
    // Otherwise place selected tile
    placeTile(row, col);
  }, [tentativePlacements, removeTentative, placeTile]);

  const clearPlacements = useCallback(() => {
    if (!game) return;
    setRack(assignIds(game.rack));
    setTentativePlacements([]);
    setSelectedTileIndex(null);
  }, [game, assignIds]);

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
    if (!game || tentativePlacements.length === 0) return;
    setError('');
    setSubmitting(true);
    try {
      const tiles: TilePlacement[] = tentativePlacements.map(({ row, col, letter, isBlank }) => ({
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
  }, [game, gameId, tentativePlacements, loadGame, onGameFinished]);

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

  const submitExchange = useCallback(async () => {
    if (exchangeSelection.size === 0) return;
    await exchangeTiles([...exchangeSelection]);
    setExchangeMode(false);
    setExchangeSelection(new Set());
  }, [exchangeSelection, exchangeTiles]);

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
