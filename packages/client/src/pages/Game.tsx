import { useParams, useNavigate } from 'react-router';
import { Board } from '../components/Board.js';
import { Rack } from '../components/Rack.js';
import { useGame } from '../hooks/useGame.js';
import styles from './Game.module.css';

export function Game() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    game,
    rack,
    selectedTileIndex,
    setSelectedTileIndex,
    tentativePlacements,
    isMyTurn,
    error,
    submitting,
    onCellClick,
    clearPlacements,
    shuffleRack,
    submitMove,
    pass,
    resign,
  } = useGame(id!);

  if (!game) {
    return <div className={styles.loading}>Loading game...</div>;
  }

  const myScore = game.playerNumber === 1 ? game.player1Score : game.player2Score;
  const opponentScore = game.playerNumber === 1 ? game.player2Score : game.player1Score;
  const isFinished = game.status === 'finished';
  const didWin = isFinished && game.winnerId !== null && (
    (game.playerNumber === 1 && game.winnerId === game.id) ||
    myScore > opponentScore
  );

  return (
    <div className={styles.gamePage}>
      <button onClick={() => navigate('/')} className={styles.backButton}>
        &larr; Lobby
      </button>
      <div className={styles.scoreboard}>
        <div className={`${styles.playerScore} ${isMyTurn ? styles.activePlayer : ''}`}>
          <span className={styles.playerLabel}>You</span>
          <span className={styles.scoreValue}>{myScore}</span>
        </div>
        <div className={styles.gameStatus}>
          {isFinished ? (
            <span className={styles.finished}>Game Over</span>
          ) : isMyTurn ? (
            <span className={styles.yourTurn}>Your Turn</span>
          ) : (
            <span className={styles.waiting}>Waiting...</span>
          )}
          <span className={styles.tilesLeft}>{game.tilesRemaining} tiles left</span>
        </div>
        <div className={`${styles.playerScore} ${!isMyTurn && !isFinished ? styles.activePlayer : ''}`}>
          <span className={styles.playerLabel}>{game.opponentUsername || '?'}</span>
          <span className={styles.scoreValue}>{opponentScore}</span>
        </div>
      </div>

      <Board
        board={game.board}
        tentativePlacements={tentativePlacements}
        onCellClick={onCellClick}
        lastMoveTiles={game.lastMove?.tilesPlaced}
      />

      {!isFinished && (
        <Rack
          tiles={rack}
          selectedIndex={selectedTileIndex}
          onSelect={setSelectedTileIndex}
          onShuffle={shuffleRack}
        />
      )}

      {error && <p className={styles.error}>{error}</p>}

      {!isFinished && isMyTurn && (
        <div className={styles.actions}>
          <button
            onClick={submitMove}
            disabled={tentativePlacements.length === 0 || submitting}
            className={styles.playButton}
          >
            Play Word
          </button>
          {tentativePlacements.length > 0 && (
            <button onClick={clearPlacements} className={styles.secondaryAction}>
              Clear
            </button>
          )}
          <button onClick={pass} disabled={submitting} className={styles.secondaryAction}>
            Pass
          </button>
          <button onClick={resign} className={styles.dangerAction}>
            Resign
          </button>
        </div>
      )}

      {isFinished && (
        <div className={styles.gameOverOverlay}>
          <h2>{myScore > opponentScore ? 'You Won!' : myScore < opponentScore ? 'You Lost' : 'Draw'}</h2>
          <p>{myScore} - {opponentScore}</p>
          <button onClick={() => navigate('/')} className={styles.playButton}>
            Back to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
