import { useState, useRef, useCallback } from 'react';
import { Tile } from './Tile.js';
import { useTileDrag } from '../context/TileDragContext.js';
import styles from './Board.module.css';
import { LETTER_POINTS } from '@word-garden/shared';
import type { BoardCell, TilePlacement, Tile as TileType } from '@word-garden/shared';

interface BoardProps {
  board: BoardCell[][];
  tentativePlacements: TilePlacement[];
  onCellClick: (row: number, col: number) => void;
  onDropFromRack?: (row: number, col: number, rackIndex: number) => void;
  onMoveTentative?: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onReturnToRack?: (row: number, col: number) => void;
  lastMoveTiles?: TilePlacement[];
  isMyTurn?: boolean;
}

const PREMIUM_LABELS: Record<string, string> = {
  TW: 'TW',
  DW: 'DW',
  TL: 'TL',
  DL: 'DL',
};

export function Board({ board, tentativePlacements, onCellClick, onDropFromRack, onMoveTentative, onReturnToRack, lastMoveTiles = [], isMyTurn }: BoardProps) {
  const tentativeMap = new Map(tentativePlacements.map(t => [`${t.row},${t.col}`, t]));
  const lastMoveSet = new Set(lastMoveTiles.map(t => `${t.row},${t.col}`));
  const { dragState, startDrag, endDrag } = useTileDrag();
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const rect = boardEl.getBoundingClientRect();
    const x = e.clientX - rect.left - 4;
    const y = e.clientY - rect.top - 4;
    const cellSize = (rect.width - 8) / 15;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (row >= 0 && row < 15 && col >= 0 && col < 15) {
      const cell = board[row][col];
      const hasTentative = tentativePlacements.some(t => t.row === row && t.col === col);
      if (!cell.tile && !hasTentative) {
        setHoverCell(prev => (prev?.row === row && prev?.col === col) ? prev : { row, col });
      } else {
        setHoverCell(null);
      }
    } else {
      setHoverCell(null);
    }
  }, [dragState, board, tentativePlacements]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    // Compute which cell the pointer is over (same logic as handlePointerMove)
    const boardEl = boardRef.current;
    if (boardEl) {
      const rect = boardEl.getBoundingClientRect();
      const x = e.clientX - rect.left - 4;
      const y = e.clientY - rect.top - 4;
      const cellSize = (rect.width - 8) / 15;
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);

      if (row >= 0 && row < 15 && col >= 0 && col < 15) {
        const cell = board[row][col];
        const hasTentative = tentativePlacements.some(t => t.row === row && t.col === col);
        if (!cell.tile && !hasTentative) {
          if (dragState.source.type === 'rack' && onDropFromRack) {
            onDropFromRack(row, col, dragState.source.index);
          } else if (dragState.source.type === 'board' && onMoveTentative) {
            onMoveTentative(dragState.source.row, dragState.source.col, row, col);
          }
        }
      }
    }

    setHoverCell(null);
    endDrag();
  }, [dragState, board, tentativePlacements, onDropFromRack, onMoveTentative, endDrag]);

  const handlePointerLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  const handleTentativePointerDown = useCallback((e: React.PointerEvent, row: number, col: number, tentative: TilePlacement) => {
    if (!isMyTurn) return;
    e.stopPropagation();
    const tile: TileType = { letter: tentative.letter, points: tentative.isBlank ? 0 : (LETTER_POINTS.get(tentative.letter.toUpperCase()) ?? 0) };
    startDrag({ tile, source: { type: 'board', row, col } });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isMyTurn, startDrag]);

  return (
    <div
      ref={boardRef}
      className={styles.board}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {board.map((row, r) =>
        row.map((cell, c) => {
          const tentative = tentativeMap.get(`${r},${c}`);
          const isLastMove = lastMoveSet.has(`${r},${c}`);
          const premiumClass = cell.premium ? styles[`premium${cell.premium}`] : '';
          const isCenter = r === 7 && c === 7;
          const isHovered = hoverCell?.row === r && hoverCell?.col === c;

          return (
            <div
              key={`${r}-${c}`}
              data-row={r}
              data-col={c}
              className={`${styles.cell} ${premiumClass} ${isLastMove ? styles.lastMove : ''} ${isHovered ? styles.dropHover : ''}`}
              onClick={() => onCellClick(r, c)}
            >
              {cell.tile ? (
                <Tile letter={cell.tile.letter} points={cell.tile.points} />
              ) : tentative ? (
                <div
                  onPointerDown={(e) => handleTentativePointerDown(e, r, c, tentative)}
                  style={{ width: '100%', height: '100%' }}
                >
                  <Tile letter={tentative.letter} points={tentative.isBlank ? 0 : (LETTER_POINTS.get(tentative.letter.toUpperCase()) ?? 0)} tentative />
                </div>
              ) : (
                <span className={styles.premiumLabel}>
                  {cell.premium ? PREMIUM_LABELS[cell.premium] : isCenter ? '\u2605' : ''}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
