# Rack Drag-and-Drop Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Animate rack tile dragging so the dragged tile follows the pointer and other tiles slide to preview the reordered arrangement.

**Architecture:** Extend the existing `useRackDrag` hook to track pointer deltas and compute per-slot CSS transforms. The dragged tile gets an inline `translate(dx, dy)` following the pointer. Other tiles get `translateX(±slotWidth)` with CSS transitions to slide into preview positions. No new dependencies.

**Tech Stack:** React, CSS Modules, Pointer Events API, CSS transforms/transitions

---

### Task 1: Update useRackDrag hook to track drag offset and compute slot styles

**Files:**
- Modify: `packages/client/src/hooks/useRackDrag.ts` (full rewrite)

**Step 1: Rewrite the hook**

Replace the full contents of `useRackDrag.ts` with:

```typescript
import { useRef, useCallback, useState, type CSSProperties } from 'react';

interface DragState {
  dragIndex: number | null;
  overIndex: number | null;
}

interface UseRackDragOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
}

export function useRackDrag({ onReorder, disabled }: UseRackDragOptions) {
  const [dragState, setDragState] = useState<DragState>({ dragIndex: null, overIndex: null });
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rectsRef = useRef<DOMRect[]>([]);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);

  const hitTest = useCallback((clientX: number, clientY: number): number | null => {
    const rects = rectsRef.current;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return i;
      }
    }
    return null;
  }, []);

  const cleanup = useCallback(() => {
    setDragState({ dragIndex: null, overIndex: null });
    setDragOffset(null);
    setDropping(false);
    setDropTarget(null);
    startPosRef.current = null;
    didDragRef.current = false;
    dragIndexRef.current = null;
    overIndexRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (disabled || e.button !== 0) return;

    startPosRef.current = { x: e.clientX, y: e.clientY };
    dragIndexRef.current = index;
    overIndexRef.current = index;
    didDragRef.current = false;
    suppressClickRef.current = false;

    rectsRef.current = slotRefs.current.map(el => el?.getBoundingClientRect() ?? new DOMRect());

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIndexRef.current === null || !startPosRef.current) return;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;

    if (!didDragRef.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      didDragRef.current = true;
      suppressClickRef.current = true;
      setDragState({ dragIndex: dragIndexRef.current, overIndex: dragIndexRef.current });
    }

    setDragOffset({ x: dx, y: dy });

    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== null && hit !== overIndexRef.current) {
      overIndexRef.current = hit;
      setDragState({ dragIndex: dragIndexRef.current, overIndex: hit });
    }
  }, [hitTest]);

  const onPointerUp = useCallback(() => {
    if (dragIndexRef.current === null) return;

    if (didDragRef.current && overIndexRef.current !== null && dragIndexRef.current !== overIndexRef.current) {
      // Compute drop animation target: distance from current drag position to the target slot
      const rects = rectsRef.current;
      const fromRect = rects[dragIndexRef.current];
      const toRect = rects[overIndexRef.current];
      const targetX = toRect.left - fromRect.left;
      const targetY = toRect.top - fromRect.top;

      const savedDragIndex = dragIndexRef.current;
      const savedOverIndex = overIndexRef.current;

      setDropping(true);
      setDropTarget({ x: targetX, y: targetY });

      setTimeout(() => {
        onReorder(savedDragIndex, savedOverIndex);
        cleanup();
      }, 150);
    } else {
      cleanup();
    }
  }, [onReorder, cleanup]);

  const onPointerCancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const setSlotRef = useCallback((index: number, el: HTMLDivElement | null) => {
    slotRefs.current[index] = el;
  }, []);

  const getSlotStyle = useCallback((index: number): CSSProperties => {
    const { dragIndex, overIndex } = dragState;
    if (dragIndex === null || overIndex === null) return {};

    // The dragged tile follows the pointer (or animates to drop target)
    if (index === dragIndex) {
      if (dropping && dropTarget) {
        return {
          transform: `translate(${dropTarget.x}px, ${dropTarget.y}px) scale(1.05)`,
          transition: 'transform 0.15s ease',
          zIndex: 10,
          position: 'relative',
        };
      }
      if (dragOffset) {
        return {
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.05)`,
          transition: 'none',
          zIndex: 10,
          position: 'relative',
        };
      }
      return {};
    }

    // Other tiles slide to preview the reordered arrangement
    const rects = rectsRef.current;
    if (rects.length === 0) return {};
    const slotWidth = rects[0].width + 4; // tile width + gap

    let shift = 0;
    if (dragIndex < overIndex) {
      // Dragging right: tiles between dragIndex+1..overIndex shift left
      if (index > dragIndex && index <= overIndex) {
        shift = -slotWidth;
      }
    } else if (dragIndex > overIndex) {
      // Dragging left: tiles between overIndex..dragIndex-1 shift right
      if (index >= overIndex && index < dragIndex) {
        shift = slotWidth;
      }
    }

    if (shift === 0) return {};

    return {
      transform: `translateX(${shift}px)`,
      transition: 'transform 0.15s ease',
    };
  }, [dragState, dragOffset, dropping, dropTarget]);

  return {
    dragState,
    suppressClickRef,
    setSlotRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    getSlotStyle,
  };
}
```

**Step 2: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/client/src/hooks/useRackDrag.ts
git commit -m "feat: add drag offset tracking and slot style computation to useRackDrag"
```

---

### Task 2: Update Rack component to apply animated styles

**Files:**
- Modify: `packages/client/src/components/Rack.tsx:17-57`

**Step 1: Update the component**

In `Rack.tsx`, update the destructured return from `useRackDrag` to include `getSlotStyle`:

```typescript
const { dragState, suppressClickRef, setSlotRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, getSlotStyle } = useRackDrag({
```

Then replace the tile mapping block (the `{tiles.map(...)}` inside the `.rack` div) with:

```typescript
{tiles.map((tile, i) => {
  const isDragging = dragState.dragIndex === i;
  const slotClass = `${styles.rackSlot}${isDragging ? ` ${styles.lifting}` : ''}`;

  return (
    <div
      key={i}
      ref={(el) => setSlotRef(i, el)}
      className={slotClass}
      style={getSlotStyle(i)}
      onPointerDown={(e) => onPointerDown(e, i)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <Tile
        letter={tile.letter}
        points={tile.points}
        selected={exchangeMode ? exchangeSelection?.has(i) : selectedIndex === i}
        onClick={() => handleClick(i)}
      />
    </div>
  );
})}
```

Key changes: removed `isDropTarget` variable, changed class from `dragging`/`dropTarget` to `lifting`, added `style={getSlotStyle(i)}`.

**Step 2: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/client/src/components/Rack.tsx
git commit -m "feat: apply animated drag styles in Rack component"
```

---

### Task 3: Update CSS to replace old drag classes with lifting class

**Files:**
- Modify: `packages/client/src/components/Rack.module.css:18-34`

**Step 1: Update the CSS**

Replace the `.rackSlot`, `.dragging`, and `.dropTarget` rules (lines 18-34) with:

```css
.rackSlot {
  width: clamp(36px, 8vw, 52px);
  height: clamp(36px, 8vw, 52px);
  transition: transform 0.15s ease;
}

.lifting {
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}
```

The `.rackSlot` keeps the existing transition (used by sliding tiles). The `.lifting` class adds a shadow to the dragged tile. The old `.dragging` (opacity/scale) and `.dropTarget` (dashed outline) are removed since the animation replaces them.

**Step 2: Verify visually**

Run: `cd packages/client && npm run dev`
Open the app, start a game, and test:
- Drag a tile: it should lift up with a shadow and follow the pointer
- Other tiles should slide smoothly to show the preview arrangement
- Dropping the tile should animate it to its final position
- Quick clicks should still select tiles (no drag interference)

**Step 3: Commit**

```bash
git add packages/client/src/components/Rack.module.css
git commit -m "feat: replace drag/drop-target styles with lifting shadow for animated drag"
```
