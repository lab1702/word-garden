# Board Drag-and-Drop Design

## Goal

Let players drag tiles between the rack and the board (and between board cells), in addition to the existing click-to-place flow.

## Drag Interactions

1. **Rack to Board**: Drag a rack tile onto an empty board cell to place it
2. **Board to Rack**: Drag a tentative tile off the board to return it to the rack
3. **Board to Board**: Drag a tentative tile to a different empty cell to relocate it
4. **Rack to Rack**: Already implemented (reorder tiles)

## Approach: Shared DragContext

A React context provides shared drag state between Rack and Board.

```typescript
interface TileDragState {
  tile: Tile;
  source:
    | { type: 'rack'; index: number }
    | { type: 'board'; row: number; col: number };
}
```

Context exposes:
- `dragState: TileDragState | null` — what's being dragged
- `startDrag(state: TileDragState)` — called when drag begins
- `endDrag()` — called when drag ends

## Pointer Capture Strategy

Pointer events are captured at the Game page level (wrapper div) so drags can cross from rack to board without losing the pointer. Hit testing uses `document.elementsFromPoint()` or cached cell/slot rects.

## Rack Changes

- On drag start, calls `startDrag()` on context
- On drag end, calls `endDrag()`
- If pointer leaves rack bounds during drag, does not call `onReorder` — drop is handled by the Board
- Rack becomes a drop target for board-to-rack drags (pointer enters rack area while dragging a board tile)
- Rack-to-rack reorder continues unchanged

## Board Changes

- When `dragState` is non-null, board tracks which cell the pointer is over and highlights it
- On `pointerUp` over a valid empty cell:
  - `source.type === 'rack'`: places tile on board (same as click-to-place)
  - `source.type === 'board'`: relocates tentative tile to new cell
- Tentative tiles become draggable: pointer down starts drag with `source: { type: 'board', row, col }`

## Visual Feedback

- Dragged tile: follows pointer with translate(), scale 1.05, drop shadow
- Board cell hover: highlighted with greenish tint background
- Invalid cells (occupied): no highlight, drop is no-op
- Rack hover (board-to-rack): subtle highlight on rack area

## Blank Tile Handling

Dragging a blank tile from rack to board opens the blank tile picker modal on drop, same as click flow.

## Preserved Behavior

- Click-to-select and click-to-place unchanged
- Click tentative tile to return unchanged
- Rack reorder drag unchanged
- Exchange mode disables all drag

## Files to Modify/Create

- Create: `packages/client/src/context/TileDragContext.tsx`
- Modify: `packages/client/src/hooks/useRackDrag.ts` — integrate with context
- Modify: `packages/client/src/components/Board.tsx` — add drop target + drag source for tentative tiles
- Modify: `packages/client/src/components/Board.module.css` — hover highlight style
- Modify: `packages/client/src/components/Rack.tsx` — integrate context, drop target for board tiles
- Modify: `packages/client/src/components/Rack.module.css` — rack drop target highlight
- Modify: `packages/client/src/pages/Game.tsx` — wrap with context provider, pointer capture at game level
- Modify: `packages/client/src/hooks/useGame.ts` — add moveTentative function
