import { useRef, useCallback, useState } from 'react';

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

    // Cache slot rects
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

    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== null && hit !== overIndexRef.current) {
      overIndexRef.current = hit;
      setDragState({ dragIndex: dragIndexRef.current, overIndex: hit });
    }
  }, [hitTest]);

  const onPointerUp = useCallback(() => {
    if (dragIndexRef.current === null) return;

    if (didDragRef.current && overIndexRef.current !== null && dragIndexRef.current !== overIndexRef.current) {
      onReorder(dragIndexRef.current, overIndexRef.current);
    }

    cleanup();
  }, [onReorder, cleanup]);

  const onPointerCancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const setSlotRef = useCallback((index: number, el: HTMLDivElement | null) => {
    slotRefs.current[index] = el;
  }, []);

  return {
    dragState,
    suppressClickRef,
    setSlotRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
