import { Tile } from './Tile.js';
import styles from './Rack.module.css';
import type { Tile as TileType } from '@word-garden/shared';

interface RackProps {
  tiles: TileType[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onShuffle: () => void;
  exchangeMode?: boolean;
  exchangeSelection?: Set<number>;
}

export function Rack({ tiles, selectedIndex, onSelect, onShuffle, exchangeMode, exchangeSelection }: RackProps) {
  return (
    <div className={styles.rackContainer}>
      <div className={styles.rack}>
        {tiles.map((tile, i) => (
          <div key={i} className={styles.rackSlot}>
            <Tile
              letter={tile.letter}
              points={tile.points}
              selected={exchangeMode ? exchangeSelection?.has(i) : selectedIndex === i}
              onClick={() => onSelect(i)}
            />
          </div>
        ))}
      </div>
      <button onClick={onShuffle} className={styles.shuffleButton} title="Shuffle tiles">
        Shuffle
      </button>
    </div>
  );
}
