import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api.js';
import { useSSE } from './useSSE.js';
import type { BoardCell, Tile, TilePlacement } from '@word-garden/shared';

interface GameData {
  id: string;
  playerNumber: 1 | 2;
  opponentUsername: string;
  board: BoardCell[][];
  currentTurn: 1 | 2;
  player1Score: number;
  player2Score: number;
  status: string;
  winnerId: string | null;
  rack: Tile[];
  tilesRemaining: number;
  lastMove: {
    playerId: string;
    moveType: string;
    tilesPlaced: TilePlacement[];
    wordsFormed: { word: string; score: number }[];
    totalScore: number;
    createdAt: string;
  } | null;
}

export function useGame(gameId: string) {
  const [game, setGame] = useState<GameData | null>(null);
  const [rack, setRack] = useState<Tile[]>([]);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [tentativePlacements, setTentativePlacements] = useState<(TilePlacement & { rackIndex: number })[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingBlankPlacement, setPendingBlankPlacement] = useState<{ row: number; col: number; rackIndex: number } | null>(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSelection, setExchangeSelection] = useState<Set<number>>(new Set());

  const loadGame = useCallback(async () => {
    try {
      const data = await apiFetch<GameData>(`/games/${gameId}`);
      setGame(data);
      setRack(data.rack);
      setTentativePlacements([]);
      setSelectedTileIndex(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [gameId]);

  useEffect(() => { loadGame(); }, [loadGame]);

  useSSE({
    opponent_moved: (data: { gameId: string }) => {
      if (data.gameId === gameId) loadGame();
    },
    game_finished: (data: { gameId: string }) => {
      if (data.gameId === gameId) loadGame();
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
      setPendingBlankPlacement({ row, col, rackIndex: selectedTileIndex });
      return;
    }

    setTentativePlacements(prev => [
      ...prev,
      { row, col, letter: tile.letter, isBlank: false, rackIndex: selectedTileIndex },
    ]);

    // Remove from available rack tiles
    setRack(prev => prev.filter((_, i) => i !== selectedTileIndex));
    setSelectedTileIndex(null);
  }, [game, isMyTurn, selectedTileIndex, rack, tentativePlacements]);

  const confirmBlankTile = useCallback((letter: string) => {
    if (!pendingBlankPlacement) return;
    const { row, col, rackIndex } = pendingBlankPlacement;

    setTentativePlacements(prev => [
      ...prev,
      { row, col, letter, isBlank: true, rackIndex },
    ]);
    setRack(prev => prev.filter((_, i) => i !== selectedTileIndex!));
    setSelectedTileIndex(null);
    setPendingBlankPlacement(null);
  }, [pendingBlankPlacement, selectedTileIndex]);

  const cancelBlankTile = useCallback(() => {
    setPendingBlankPlacement(null);
  }, []);

  const removeTentative = useCallback((row: number, col: number) => {
    const placement = tentativePlacements.find(t => t.row === row && t.col === col);
    if (!placement || !game) return;

    // Find the original tile from game rack
    const originalTile = game.rack[placement.rackIndex];
    setRack(prev => [...prev, originalTile]);
    setTentativePlacements(prev => prev.filter(t => !(t.row === row && t.col === col)));
  }, [tentativePlacements, game]);

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
    setRack(game.rack);
    setTentativePlacements([]);
    setSelectedTileIndex(null);
  }, [game]);

  const shuffleRack = useCallback(() => {
    setRack(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  }, []);

  const submitMove = useCallback(async () => {
    if (!game || tentativePlacements.length === 0) return;
    setError('');
    setSubmitting(true);
    try {
      const tiles: TilePlacement[] = tentativePlacements.map(({ row, col, letter, isBlank }) => ({
        row, col, letter, isBlank,
      }));
      const result = await apiFetch<any>(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'play', tiles }),
      });
      if (result.newRack) {
        setRack(result.newRack);
      }
      await loadGame();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [game, gameId, tentativePlacements, loadGame]);

  const pass = useCallback(async () => {
    setError('');
    setSubmitting(true);
    try {
      await apiFetch(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'pass' }),
      });
      await loadGame();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [gameId, loadGame]);

  const exchangeTiles = useCallback(async (indices: number[]) => {
    setError('');
    setSubmitting(true);
    try {
      const result = await apiFetch<any>(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'exchange', exchangeTiles: indices }),
      });
      if (result.newRack) {
        setRack(result.newRack);
      }
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
    setError('');
    setSubmitting(true);
    try {
      await exchangeTiles([...exchangeSelection]);
      setExchangeMode(false);
      setExchangeSelection(new Set());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [exchangeSelection, exchangeTiles]);

  const resign = useCallback(async () => {
    setError('');
    try {
      await apiFetch(`/games/${gameId}/resign`, { method: 'POST' });
      await loadGame();
    } catch (err: any) {
      setError(err.message);
    }
  }, [gameId, loadGame]);

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
    clearPlacements,
    shuffleRack,
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
