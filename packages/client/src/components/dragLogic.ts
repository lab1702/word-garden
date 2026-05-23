import type { DragSource } from '../context/TileDragContext.js';

/**
 * Resolve the board cell under a screen point by hit-testing the actual rendered
 * cells (which carry data-row/data-col). Shared by the board's own pointer
 * handlers and the rack-to-board drop path so both resolve identically — using
 * elementsFromPoint looks *through* any floating dragged tile (z-indexed above
 * the board) to the cell beneath. Returns null when the point is off the board.
 */
export function cellFromPoint(clientX: number, clientY: number): { row: number; col: number } | null {
  const els = document.elementsFromPoint(clientX, clientY);
  const el = els.find(
    (e): e is HTMLElement => e instanceof HTMLElement && e.dataset.row !== undefined && e.dataset.col !== undefined,
  );
  if (!el) return null;
  const row = parseInt(el.dataset.row!, 10);
  const col = parseInt(el.dataset.col!, 10);
  if (Number.isNaN(row) || Number.isNaN(col)) return null;
  return { row, col };
}

export type DropResult =
  | { action: 'placeFromRack'; row: number; col: number; rackIndex: number }
  | { action: 'moveTentative'; fromRow: number; fromCol: number; toRow: number; toCol: number }
  | { action: 'returnToRack'; row: number; col: number }
  | { action: 'none' };

export function resolveDrop(
  pos: { row: number; col: number } | null,
  targetBlocked: boolean,
  source: DragSource,
): DropResult {
  if (pos) {
    if (targetBlocked) return { action: 'none' };
    if (source.type === 'rack') {
      return { action: 'placeFromRack', row: pos.row, col: pos.col, rackIndex: source.index };
    }
    return { action: 'moveTentative', fromRow: source.row, fromCol: source.col, toRow: pos.row, toCol: pos.col };
  }
  // Dropped off the board: a board-sourced tile goes back to the rack.
  if (source.type === 'board') {
    return { action: 'returnToRack', row: source.row, col: source.col };
  }
  return { action: 'none' };
}
