import { Tile } from './Tile.js';
import styles from './Board.module.css';
import type { BoardCell, TilePlacement } from '@word-garden/shared';

interface BoardProps {
  board: BoardCell[][];
  tentativePlacements: TilePlacement[];
  onCellClick: (row: number, col: number) => void;
  lastMoveTiles?: TilePlacement[];
}

const PREMIUM_LABELS: Record<string, string> = {
  TW: 'TW',
  DW: 'DW',
  TL: 'TL',
  DL: 'DL',
};

export function Board({ board, tentativePlacements, onCellClick, lastMoveTiles = [] }: BoardProps) {
  const tentativeMap = new Map(tentativePlacements.map(t => [`${t.row},${t.col}`, t]));
  const lastMoveSet = new Set(lastMoveTiles.map(t => `${t.row},${t.col}`));

  return (
    <div className={styles.board}>
      {board.map((row, r) =>
        row.map((cell, c) => {
          const tentative = tentativeMap.get(`${r},${c}`);
          const isLastMove = lastMoveSet.has(`${r},${c}`);
          const premiumClass = cell.premium ? styles[`premium${cell.premium}`] : '';
          const isCenter = r === 7 && c === 7;

          return (
            <div
              key={`${r}-${c}`}
              className={`${styles.cell} ${premiumClass} ${isLastMove ? styles.lastMove : ''}`}
              onClick={() => onCellClick(r, c)}
            >
              {cell.tile ? (
                <Tile letter={cell.tile.letter} points={cell.tile.points} />
              ) : tentative ? (
                <Tile letter={tentative.letter} points={0} tentative />
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
