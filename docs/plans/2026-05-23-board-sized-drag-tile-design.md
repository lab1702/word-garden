# Board-sized dragged tile

## Problem

When a tile is picked up from the rack and dragged, the floating tile is rendered
at rack size (`clamp(36px, 8vw, 72px)`), which is noticeably larger than a board
cell. The oversized tile covers the target cell, making it hard to drop precisely.

## Goal

While dragging a rack tile, render the floating tile at the size it will be on the
board, centered on the cursor, so the player can see exactly which cell it will
drop into.

## Scope

Only the **rack → board** drag path. Board → board tentative moves have no floating
tile (only a `dropHover` cell highlight moves), so there is nothing to resize there.

Drop resolution is unchanged: the target cell is still decided by the cursor
position via `cellFromPoint(clientX, clientY)`, not by the tile. Resizing the tile
is purely visual feedback.

## Changes

All changes are in `useRackDrag.ts` plus two pure helpers in `dragLogic.ts`.

### `dragLogic.ts` (pure, unit-tested)

- `dragTileScale(boardCellWidth, rackSlotWidth)` → scale ratio
  `boardCellWidth / rackSlotWidth`. Falls back to `1.05` (the prior "lift" cue)
  when either width is missing/zero, so a missing board never collapses the tile.
- `dragTileTranslate(pointer, slotCenter)` → `{ x, y }` = `pointer - slotCenter`.
  Because the slot is scaled around its own center, translating its center onto the
  cursor places the shrunk tile directly over the cursor's cell.

### `useRackDrag.ts`

- At drag start (`onPointerDown`), measure the board cell width via
  `document.querySelector('[data-row][data-col]')` — the same DOM convention
  `cellFromPoint` uses — and the dragged slot's width from the captured rects.
  Store `dragTileScale(...)` in a ref.
- Track the absolute pointer position during `onPointerMove` (currently a delta).
- In `getSlotStyle`, for the dragged slot, compute the transform as
  `translate(dragTileTranslate(pointer, slotCenter)) scale(dragScale)` with
  `slotCenter` derived from the captured rect. Replaces the previous
  `translate(dx, dy) scale(1.05)`.

No public API change to the hook. Rack reorder hit-tests still use the original
slot rects, so reordering within the rack is unaffected.

## Feel

The shrink + recenter is instant (no transition, matching today's pointer-follow),
so no new motion to gate behind `prefers-reduced-motion`. When reordering within
the rack, the tile also appears board-sized and centered on the cursor — consistent
with "board-sized whenever dragging."

## Testing

- TDD the two pure helpers in `dragLogic.test.ts`: scale ratio, scale fallback,
  and translate centering.
- The hook's transform wiring is verified by running the app.
