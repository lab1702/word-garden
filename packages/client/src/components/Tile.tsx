import styles from './Tile.module.css';

interface TileProps {
  letter: string;
  points: number;
  selected?: boolean;
  tentative?: boolean;
  lastMove?: boolean;
  isBlank?: boolean;
  onClick?: () => void;
}

export function Tile({ letter, points, selected, tentative, lastMove, isBlank, onClick }: TileProps) {
  return (
    <div
      className={`${styles.tile} ${isBlank ? styles.blank : ''} ${selected ? styles.selected : ''} ${tentative ? styles.tentative : ''} ${lastMove ? styles.lastMove : ''}`}
      onClick={onClick}
    >
      <span className={styles.letter}>{letter || '\u00A0'}</span>
      {/* Blanks have no point value - showing "0" would be misleading. */}
      {letter && !isBlank && <span className={styles.points}>{points}</span>}
    </div>
  );
}
