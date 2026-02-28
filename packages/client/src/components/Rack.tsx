import { Tile } from './Tile.js';
import styles from './Rack.module.css';
import type { Tile as TileType } from '@word-garden/shared';

interface RackProps {
  tiles: TileType[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onShuffle: () => void;
}

export function Rack({ tiles, selectedIndex, onSelect, onShuffle }: RackProps) {
  return (
    <div className={styles.rackContainer}>
      <div className={styles.rack}>
        {tiles.map((tile, i) => (
          <div key={i} className={styles.rackSlot}>
            <Tile
              letter={tile.letter}
              points={tile.points}
              selected={selectedIndex === i}
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
