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

  return (
    <TileDragProvider>
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
          <span className={styles.playerLabel}>{game.opponentUsername || '?'}{game.opponentRating != null ? ` (${Math.round(game.opponentRating)})` : ''}</span>
          <span className={styles.scoreValue}>{opponentScore}</span>
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

      {!isFinished && isMyTurn && (
        <div className={styles.actions}>
          {exchangeMode ? (
            <>
              <button
                onClick={submitExchange}
                disabled={exchangeSelection.size === 0 || submitting}
                className={styles.playButton}
              >
                Exchange {exchangeSelection.size > 0 ? `(${exchangeSelection.size})` : ''}
              </button>
              <button onClick={exitExchangeMode} className={styles.secondaryAction}>
                Cancel
              </button>
            </>
          ) : (
            <>
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
              <button
                onClick={enterExchangeMode}
                disabled={submitting || game.tilesRemaining === 0}
                className={styles.secondaryAction}
              >
                Exchange
              </button>
              <button onClick={pass} disabled={submitting} className={styles.secondaryAction}>
                Pass
              </button>
              <button onClick={resign} className={styles.dangerAction}>
                Resign
              </button>
            </>
          )}
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

      {pendingBlankPlacement && (
        <BlankTilePicker onSelect={confirmBlankTile} onCancel={cancelBlankTile} />
      )}
    </div>
    </TileDragProvider>
  );
}
