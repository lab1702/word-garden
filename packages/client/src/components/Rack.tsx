import { useCallback } from 'react';
import { Tile } from './Tile.js';
import { useRackDrag } from '../hooks/useRackDrag.js';
import { useTileDrag } from '../context/TileDragContext.js';
import styles from './Rack.module.css';
import type { Tile as TileType } from '@word-garden/shared';

interface RackProps {
  tiles: TileType[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onShuffle: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  exchangeMode?: boolean;
  exchangeSelection?: Set<number>;
  onReturnToRack?: (row: number, col: number) => void;
  onDropOutside?: (rackIndex: number, clientX: number, clientY: number) => void;
}

export function Rack({ tiles, selectedIndex, onSelect, onShuffle, onReorder, exchangeMode, exchangeSelection, onReturnToRack, onDropOutside }: RackProps) {
  const { dragState: tileDragState, startDrag, endDrag } = useTileDrag();

  const handleDragStart = useCallback((index: number) => {
    startDrag({ tile: tiles[index], source: { type: 'rack', index } });
  }, [tiles, startDrag]);

  const { dragState, suppressClickRef, setSlotRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, getSlotStyle } = useRackDrag({
    onReorder,
    disabled: exchangeMode,
    onDragStart: handleDragStart,
    onDragEnd: endDrag,
    onDropOutside,
  });

  const handleClick = useCallback((index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(index);
  }, [onSelect, suppressClickRef]);

  const handleRackPointerUp = useCallback(() => {
    if (tileDragState?.source.type === 'board' && onReturnToRack) {
      onReturnToRack(tileDragState.source.row, tileDragState.source.col);
      endDrag();
    }
  }, [tileDragState, onReturnToRack, endDrag]);

  const isRackDropTarget = tileDragState?.source.type === 'board';

  return (
    <div className={styles.rackContainer}>
      <div
        className={`${styles.rack}${isRackDropTarget ? ` ${styles.rackDropTarget}` : ''}`}
        onPointerUp={handleRackPointerUp}
      >
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
      </div>
      <button onClick={onShuffle} className={styles.shuffleButton} title="Shuffle tiles">
        Shuffle
      </button>
    </div>
  );
}
