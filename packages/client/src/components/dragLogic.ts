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

/** Fallback scale when the board can't be measured — a subtle "lift" cue. */
const LIFT_SCALE = 1.05;

/**
 * Scale to shrink a dragged rack tile down to the size of a board cell, so the
 * floating tile matches where it will land. Falls back to a subtle lift when
 * either dimension is unmeasurable (e.g. the board isn't rendered).
 */
export function dragTileScale(boardCellWidth: number, rackSlotWidth: number): number {
  if (boardCellWidth > 0 && rackSlotWidth > 0) return boardCellWidth / rackSlotWidth;
  return LIFT_SCALE;
}

/**
 * Translate offset that centers the dragged tile on the cursor. Because the slot
 * is scaled around its own center, moving that center onto the pointer puts the
 * shrunk tile directly over the cell the cursor is hovering.
 */
export function dragTileTranslate(
  pointer: { x: number; y: number },
  slotCenter: { x: number; y: number },
): { x: number; y: number } {
  return { x: pointer.x - slotCenter.x, y: pointer.y - slotCenter.y };
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
