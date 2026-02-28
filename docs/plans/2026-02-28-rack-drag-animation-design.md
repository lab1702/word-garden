# Rack Drag-and-Drop Animation Design

## Goal

Animate dragging rack tiles so the dragged tile follows the pointer and other tiles slide to preview the reordered arrangement.

## Approach

CSS transform-based animation on top of the existing Pointer Events hook. No new dependencies.

## Dragged Tile

- After the 5px drag threshold, the tile lifts up: `scale(1.05)`, drop shadow, `z-index: 10`
- Position tracks the pointer via `transform: translate(deltaX, deltaY)` (offset from pointer start)
- On drop, tile animates to its final slot position, then transforms reset

## Sliding Tiles

- Other tiles preview the reordered arrangement while dragging
- Tiles compute where they'd be if the dragged tile were removed from `dragIndex` and inserted at `overIndex`
- Shifted tiles get `transform: translateX(+/-slotWidth)` where slotWidth = tile width + 4px gap
- Existing `transition: transform 0.15s ease` on `.rackSlot` handles smooth animation

## Position Math

For drag from index D to hover over index O:
- If D < O: tiles at D+1 through O shift left by one slot width
- If D > O: tiles at O through D-1 shift right by one slot width
- All other tiles stay put

## Hook Changes (`useRackDrag`)

New return values:
- `dragOffset: { x, y } | null` — pointer delta for the floating tile
- `getSlotStyle(index): CSSProperties` — inline style with transform/transition per slot

Track pointer delta in a ref, update on pointermove. Compute slot width from cached DOMRects.

## CSS Changes

- New `.lifting` class: z-index, scale, box-shadow for the elevated tile
- Remove `.dragging` (opacity/scale) and `.dropTarget` (dashed outline) — replaced by slide animation
- Keep existing `transition` on `.rackSlot`

## Drop Animation

On pointer up, compute delta from current pointer position to target slot. Apply as a final transform, clean up after 150ms transition completes.

## Files to Modify

1. `packages/client/src/hooks/useRackDrag.ts` — add offset tracking, getSlotStyle, drop animation
2. `packages/client/src/components/Rack.tsx` — apply getSlotStyle, update class logic
3. `packages/client/src/components/Rack.module.css` — replace dragging/dropTarget with lifting class
