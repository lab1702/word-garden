import { useState, useRef, useCallback } from 'react';
import { Tile } from './Tile.js';
import { useTileDrag } from '../context/TileDragContext.js';
import styles from './Board.module.css';
import { LETTER_POINTS, BOARD_SIZE, CENTER } from '@word-garden/shared';
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

const PREMIUM_ARIA: Record<string, string> = {
  TW: 'Triple Word',
  DW: 'Double Word',
  TL: 'Triple Letter',
  DL: 'Double Letter',
};

function getCellFromPointer(e: React.PointerEvent, boardEl: HTMLDivElement): { row: number; col: number } | null {
  const rect = boardEl.getBoundingClientRect();
  const style = getComputedStyle(boardEl);
  const pad = parseFloat(style.paddingLeft) || 0;
  const cellSize = (rect.width - pad * 2) / BOARD_SIZE;
  const col = Math.floor((e.clientX - rect.left - pad) / cellSize);
  const row = Math.floor((e.clientY - rect.top - pad) / cellSize);
  if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) return { row, col };
  return null;
}

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

    const pos = getCellFromPointer(e, boardEl);
    if (pos) {
      const cell = board[pos.row][pos.col];
      const hasTentative = tentativePlacements.some(t => t.row === pos.row && t.col === pos.col);
      if (!cell.tile && !hasTentative) {
        setHoverCell(prev => (prev?.row === pos.row && prev?.col === pos.col) ? prev : pos);
      } else {
        setHoverCell(null);
      }
    } else {
      setHoverCell(null);
    }
  }, [dragState, board, tentativePlacements]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const boardEl = boardRef.current;
    if (boardEl) {
      const pos = getCellFromPointer(e, boardEl);
      if (pos) {
        const cell = board[pos.row][pos.col];
        const hasTentative = tentativePlacements.some(t => t.row === pos.row && t.col === pos.col);
        if (!cell.tile && !hasTentative) {
          if (dragState.source.type === 'rack' && onDropFromRack) {
            onDropFromRack(pos.row, pos.col, dragState.source.index);
          } else if (dragState.source.type === 'board' && onMoveTentative) {
            onMoveTentative(dragState.source.row, dragState.source.col, pos.row, pos.col);
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
      role="grid"
      aria-label="Game board"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {board.map((row, r) =>
        row.map((cell, c) => {
          const tentative = tentativeMap.get(`${r},${c}`);
          const isLastMove = lastMoveSet.has(`${r},${c}`);
          const premiumClass = cell.premium ? styles[`premium${cell.premium}`] : '';
          const isCenter = r === CENTER && c === CENTER;
          const isHovered = hoverCell?.row === r && hoverCell?.col === c;

          const ariaLabel = cell.tile
            ? `${cell.tile.letter}, row ${r + 1}, column ${c + 1}`
            : tentative
              ? `${tentative.letter} (tentative), row ${r + 1}, column ${c + 1}`
              : cell.premium
                ? `Empty, ${PREMIUM_ARIA[cell.premium]}, row ${r + 1}, column ${c + 1}`
                : `Empty, row ${r + 1}, column ${c + 1}`;

          return (
            <div
              key={`${r}-${c}`}
              data-row={r}
              data-col={c}
              role="gridcell"
              aria-label={ariaLabel}
              className={`${styles.cell} ${premiumClass} ${isHovered ? styles.dropHover : ''}`}
              onClick={() => onCellClick(r, c)}
            >
              {cell.tile ? (
                <Tile letter={cell.tile.letter} points={cell.tile.points} lastMove={isLastMove} />
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
