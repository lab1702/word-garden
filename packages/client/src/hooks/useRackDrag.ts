import { useRef, useCallback, useState, type CSSProperties } from 'react';
import { dragTileScale, dragTileTranslate } from '../components/dragLogic.js';

interface DragState {
  dragIndex: number | null;
  overIndex: number | null;
}

interface UseRackDragOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
  onDragStart?: (index: number) => void;
  onDragEnd?: () => void;
  onDropOutside?: (rackIndex: number, clientX: number, clientY: number) => void;
}

export function useRackDrag({ onReorder, disabled, onDragStart, onDragEnd, onDropOutside }: UseRackDragOptions) {
  const [dragState, setDragState] = useState<DragState>({ dragIndex: null, overIndex: null });
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rectsRef = useRef<DOMRect[]>([]);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  // Scale that shrinks the floating tile to board-cell size, measured at drag start.
  const dragScaleRef = useRef(1);

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
    setPointerPos(null);
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

    // Size the floating tile to match a board cell. We hit-test the rendered
    // board the same way dragLogic.cellFromPoint does, via data-row/data-col.
    const boardCell = document.querySelector('[data-row][data-col]');
    const boardCellWidth = boardCell?.getBoundingClientRect().width ?? 0;
    dragScaleRef.current = dragTileScale(boardCellWidth, rectsRef.current[index]?.width ?? 0);

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
      onDragStart?.(dragIndexRef.current);
    }

    setPointerPos({ x: e.clientX, y: e.clientY });

    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== null && hit !== overIndexRef.current) {
      overIndexRef.current = hit;
      setDragState({ dragIndex: dragIndexRef.current, overIndex: hit });
    }
  }, [hitTest, onDragStart]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragIndexRef.current === null) return;

    if (didDragRef.current) {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit !== null && dragIndexRef.current !== hit) {
        onReorder(dragIndexRef.current, hit);
      } else if (hit === null) {
        onDropOutside?.(dragIndexRef.current, e.clientX, e.clientY);
      }
      onDragEnd?.();
    }

    cleanup();
  }, [onReorder, cleanup, onDragEnd, onDropOutside, hitTest]);

  const onPointerCancel = useCallback(() => {
    if (didDragRef.current) {
      onDragEnd?.();
    }
    cleanup();
  }, [cleanup, onDragEnd]);

  const setSlotRef = useCallback((index: number, el: HTMLDivElement | null) => {
    slotRefs.current[index] = el;
  }, []);

  const getSlotStyle = useCallback((index: number): CSSProperties => {
    const { dragIndex, overIndex } = dragState;
    if (dragIndex === null || overIndex === null) return {};

    // The dragged tile shrinks to board-cell size and centers on the cursor,
    // so it sits on the exact cell it will drop into.
    if (index === dragIndex) {
      const rect = rectsRef.current[dragIndex];
      if (pointerPos && rect) {
        const slotCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const t = dragTileTranslate(pointerPos, slotCenter);
        return {
          transform: `translate(${t.x}px, ${t.y}px) scale(${dragScaleRef.current})`,
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
    const slotWidth = rects.length > 1 ? rects[1].left - rects[0].left : rects[0].width + 4;

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
  }, [dragState, pointerPos]);

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
