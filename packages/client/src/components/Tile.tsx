import styles from './Tile.module.css';

interface TileProps {
  letter: string;
  points: number;
  selected?: boolean;
  tentative?: boolean;
  onClick?: () => void;
}

export function Tile({ letter, points, selected, tentative, onClick }: TileProps) {
  return (
    <div
      className={`${styles.tile} ${selected ? styles.selected : ''} ${tentative ? styles.tentative : ''}`}
      onClick={onClick}
    >
      <span className={styles.letter}>{letter || '\u00A0'}</span>
      {letter && <span className={styles.points}>{points}</span>}
    </div>
  );
}
