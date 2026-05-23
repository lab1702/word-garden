import type { DragSource } from '../context/TileDragContext.js';

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
