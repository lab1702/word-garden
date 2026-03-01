import styles from './Tile.module.css';

interface TileProps {
  letter: string;
  points: number;
  selected?: boolean;
  tentative?: boolean;
  lastMove?: boolean;
  onClick?: () => void;
}

export function Tile({ letter, points, selected, tentative, lastMove, onClick }: TileProps) {
  return (
    <div
      className={`${styles.tile} ${selected ? styles.selected : ''} ${tentative ? styles.tentative : ''} ${lastMove ? styles.lastMove : ''}`}
      onClick={onClick}
    >
      <span className={styles.letter}>{letter || '\u00A0'}</span>
      {letter && <span className={styles.points}>{points}</span>}
    </div>
  );
}
