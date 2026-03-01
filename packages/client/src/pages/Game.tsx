import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Board } from '../components/Board.js';
import { Rack } from '../components/Rack.js';
import { BlankTilePicker } from '../components/BlankTilePicker.js';
import { useGame } from '../hooks/useGame.js';
import { TileDragProvider } from '../context/TileDragContext.js';
import styles from './Game.module.css';

export function Game({ onGameFinished }: { onGameFinished?: () => void }) {
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
    reorderRack,
    submitMove,
    pass,
    resign,
    pendingBlankPlacement,
    confirmBlankTile,
    cancelBlankTile,
    exchangeMode,
    exchangeSelection,
    enterExchangeMode,
    exitExchangeMode,
    toggleExchangeTile,
    submitExchange,
    placeTileFromRack,
    moveTentative,
    removeTentative,
  } = useGame(id!, onGameFinished);

  const handleRackDropOutside = useCallback((rackIndex: number, clientX: number, clientY: number) => {
    // The dragged tile is visually at the pointer position (z-index: 10),
    // so elementFromPoint returns it instead of the board cell underneath.
    // Use elementsFromPoint to look through all layers.
    const elements = document.elementsFromPoint(clientX, clientY);
    const el = elements.find(e => e instanceof HTMLElement && e.dataset.row !== undefined) as HTMLElement | undefined;
    if (!el) return;
    const row = parseInt(el.dataset.row!, 10);
    const col = parseInt(el.dataset.col!, 10);
    if (isNaN(row) || isNaN(col)) return;
    placeTileFromRack(row, col, rackIndex);
  }, [placeTileFromRack]);

  if (!game) {
    return <div className={styles.loading}>Loading game...</div>;
  }

  const myScore = game.playerNumber === 1 ? game.player1Score : game.player2Score;
  const opponentScore = game.playerNumber === 1 ? game.player2Score : game.player1Score;
  const isFinished = game.status === 'finished';

  // Determine each player's last score gain from the two most recent moves.
  // After any move, currentTurn switches, so:
  //   lastMove was made by player (3 - currentTurn)
  //   previousMove was made by player currentTurn
  const lastMovePlayerNum = game.currentTurn === 1 ? 2 : 1;
  let myLastScoreGain: number | null = null;
  let opponentLastScoreGain: number | null = null;

  if (game.lastMove) {
    if (lastMovePlayerNum === game.playerNumber) {
      myLastScoreGain = game.lastMove.totalScore;
    } else {
      opponentLastScoreGain = game.lastMove.totalScore;
    }
  }
  if (game.previousMove) {
    if (lastMovePlayerNum === game.playerNumber) {
      opponentLastScoreGain = game.previousMove.totalScore;
    } else {
      myLastScoreGain = game.previousMove.totalScore;
    }
  }

  return (
    <TileDragProvider>
    <div className={styles.gamePage}>
      <button onClick={() => navigate('/')} className={styles.backButton}>
        &larr; Lobby
      </button>
      <div className={styles.scoreboard}>
        <div className={`${styles.playerScore} ${isMyTurn ? styles.activePlayer : ''}`}>
          <span className={styles.playerLabel}>You</span>
          <span className={styles.scoreValue}>
            {myScore}
            {myLastScoreGain != null && <span className={styles.scoreGain}>+{myLastScoreGain}</span>}
          </span>
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
          <span className={styles.playerLabel}>{game.opponentUsername || '?'}{game.opponentRating != null ? ` (${Math.round(game.opponentRating)})` : ''}</span>
          <span className={styles.scoreValue}>
            {opponentScore}
            {opponentLastScoreGain != null && <span className={styles.scoreGain}>+{opponentLastScoreGain}</span>}
          </span>
          {!isFinished && <span className={styles.tileCount}>{game.opponentTileCount} tiles</span>}
        </div>
      </div>

      <div className={styles.boardArea}>
        <Board
          board={game.board}
          tentativePlacements={tentativePlacements}
          onCellClick={onCellClick}
          onDropFromRack={placeTileFromRack}
          onMoveTentative={moveTentative}
          onReturnToRack={removeTentative}
          lastMoveTiles={game.lastMove?.tilesPlaced}
          isMyTurn={isMyTurn}
        />
      </div>

      {!isFinished && (
        <Rack
          tiles={rack}
          selectedIndex={exchangeMode ? null : selectedTileIndex}
          onSelect={exchangeMode ? toggleExchangeTile : (i) => setSelectedTileIndex(prev => prev === i ? null : i)}
          onShuffle={shuffleRack}
          onReorder={reorderRack}
          exchangeMode={exchangeMode}
          exchangeSelection={exchangeSelection}
          onReturnToRack={removeTentative}
          onDropOutside={handleRackDropOutside}
        />
      )}

      {error && <p className={styles.error}>{error}</p>}

      {!isFinished && (
        <div className={styles.actions}>
          {exchangeMode ? (
            <>
              <button
                onClick={submitExchange}
                disabled={!isMyTurn || exchangeSelection.size === 0 || submitting}
                className={styles.playButton}
              >
                Exchange {exchangeSelection.size > 0 ? `(${exchangeSelection.size})` : ''}
              </button>
              <button onClick={exitExchangeMode} disabled={!isMyTurn} className={styles.secondaryAction}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={submitMove}
                disabled={!isMyTurn || tentativePlacements.length === 0 || submitting}
                className={styles.playButton}
              >
                Play Word
              </button>
              {tentativePlacements.length > 0 && (
                <button onClick={clearPlacements} disabled={!isMyTurn} className={styles.secondaryAction}>
                  Clear
                </button>
              )}
              <button
                onClick={enterExchangeMode}
                disabled={!isMyTurn || submitting || game.tilesRemaining === 0}
                className={styles.secondaryAction}
              >
                Exchange
              </button>
              <button onClick={pass} disabled={!isMyTurn || submitting} className={styles.secondaryAction}>
                Pass
              </button>
              <button onClick={() => { if (confirm('Are you sure you want to resign? This will count as a loss.')) resign(); }} disabled={!isMyTurn} className={styles.dangerAction}>
                Resign
              </button>
            </>
          )}
        </div>
      )}

      {isFinished && (
        <div className={styles.gameOverOverlay}>
          <h2 style={{ color: myScore > opponentScore ? 'var(--color-accent)' : myScore < opponentScore ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
            {myScore > opponentScore ? 'You Won!' : myScore < opponentScore ? 'You Lost' : 'Draw'}
          </h2>
          <p>{myScore} - {opponentScore}</p>
          {game.ratingChanges && (() => {
            const myDelta = game.ratingChanges.me.ratingAfter - game.ratingChanges.me.ratingBefore;
            const oppDelta = game.ratingChanges.opponent.ratingAfter - game.ratingChanges.opponent.ratingBefore;
            return (
              <div className={styles.ratingChanges}>
                <div className={styles.ratingRow}>
                  <span className={styles.ratingPlayer}>You</span>
                  <span className={styles.ratingValue}>{game.ratingChanges.me.ratingAfter}</span>
                  <span className={myDelta >= 0 ? styles.ratingUp : styles.ratingDown}>
                    {myDelta >= 0 ? '+' : ''}{myDelta}
                  </span>
                  {game.ratingChanges.me.rankBefore !== game.ratingChanges.me.rankAfter ? (
                    <span className={styles.rankChange}>#{game.ratingChanges.me.rankBefore} → #{game.ratingChanges.me.rankAfter}</span>
                  ) : (
                    <span className={styles.rankChange}>#{game.ratingChanges.me.rankAfter}</span>
                  )}
                </div>
                <div className={styles.ratingRow}>
                  <span className={styles.ratingPlayer}>{game.opponentUsername}</span>
                  <span className={styles.ratingValue}>{game.ratingChanges.opponent.ratingAfter}</span>
                  <span className={oppDelta >= 0 ? styles.ratingUp : styles.ratingDown}>
                    {oppDelta >= 0 ? '+' : ''}{oppDelta}
                  </span>
                  {game.ratingChanges.opponent.rankBefore !== game.ratingChanges.opponent.rankAfter ? (
                    <span className={styles.rankChange}>#{game.ratingChanges.opponent.rankBefore} → #{game.ratingChanges.opponent.rankAfter}</span>
                  ) : (
                    <span className={styles.rankChange}>#{game.ratingChanges.opponent.rankAfter}</span>
                  )}
                </div>
              </div>
            );
          })()}
          <button onClick={() => navigate('/')} className={styles.playButton}>
            Back to Lobby
          </button>
        </div>
      )}

      {pendingBlankPlacement && (
        <BlankTilePicker onSelect={confirmBlankTile} onCancel={cancelBlankTile} />
      )}
    </div>
    </TileDragProvider>
  );
}
