import styles from './BlankTilePicker.module.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface BlankTilePickerProps {
  onSelect: (letter: string) => void;
  onCancel: () => void;
}

export function BlankTilePicker({ onSelect, onCancel }: BlankTilePickerProps) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.picker} onClick={e => e.stopPropagation()}>
        <h3>Choose a letter for blank tile</h3>
        <div className={styles.letters}>
          {LETTERS.map(letter => (
            <button
              key={letter}
              className={styles.letterButton}
              onClick={() => onSelect(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
        <button className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
