import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Tile } from '@word-garden/shared';

export type DragSource =
  | { type: 'rack'; index: number }
  | { type: 'board'; row: number; col: number };

export interface TileDragState {
  tile: Tile;
  source: DragSource;
}

interface TileDragContextValue {
  dragState: TileDragState | null;
  startDrag: (state: TileDragState) => void;
  endDrag: () => void;
}

const TileDragContext = createContext<TileDragContextValue | null>(null);

export function TileDragProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<TileDragState | null>(null);

  const startDrag = useCallback((state: TileDragState) => {
    setDragState(state);
  }, []);

  const endDrag = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <TileDragContext.Provider value={{ dragState, startDrag, endDrag }}>
      {children}
    </TileDragContext.Provider>
  );
}

export function useTileDrag() {
  const ctx = useContext(TileDragContext);
  if (!ctx) throw new Error('useTileDrag must be used within TileDragProvider');
  return ctx;
}
