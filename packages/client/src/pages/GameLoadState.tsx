import styles from './Game.module.css';

export function GameLoadState({ error, onBack }: { error: string; onBack: () => void }) {
  if (error) {
    return (
      <div className={styles.loading}>
        <p className={styles.error}>{error}</p>
        <button onClick={onBack} className={styles.backButton}>&larr; Back to Lobby</button>
      </div>
    );
  }
  return <div className={styles.loading}>Loading game...</div>;
}
