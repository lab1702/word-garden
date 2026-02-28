# Board Drag-and-Drop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let players drag tiles between rack and board (and between board cells) in addition to the existing click-to-place flow.

**Architecture:** A React context (`TileDragContext`) shares drag state between Rack and Board. Pointer events are captured at the Game page level so drags can cross component boundaries. Each component (Rack, Board) handles its own hit testing and visual feedback. The existing click-to-place flow is preserved unchanged.

**Tech Stack:** React context, Pointer Events API, CSS Modules, CSS transforms

---

### Task 1: Create TileDragContext

**Files:**
- Create: `packages/client/src/context/TileDragContext.tsx`

**Step 1: Create the context file**

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Tile } from '@word-garden/shared';

export type DragSource =
  | { type: 'rack'; index: number }
  | { type: 'board'; row: number; col: number };

export interface TileDragState {
  tile: Tile;
  source: DragSource;
}

interface TileDragContextValue {
  dragState: TileDragState | null;
  startDrag: (state: TileDragState) => void;
  endDrag: () => void;
}

const TileDragContext = createContext<TileDragContextValue | null>(null);

export function TileDragProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<TileDragState | null>(null);

  const startDrag = useCallback((state: TileDragState) => {
    setDragState(state);
  }, []);

  const endDrag = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <TileDragContext.Provider value={{ dragState, startDrag, endDrag }}>
      {children}
    </TileDragContext.Provider>
  );
}

export function useTileDrag() {
  const ctx = useContext(TileDragContext);
  if (!ctx) throw new Error('useTileDrag must be used within TileDragProvider');
  return ctx;
}
```

**Step 2: Verify it compiles**

Run: `cd /home/lab/tmp/word-garden && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/client/src/context/TileDragContext.tsx
git commit -m "feat: add TileDragContext for cross-component drag state"
```

---

### Task 2: Add `placeTileFromRack` and `moveTentative` to useGame

**Files:**
- Modify: `packages/client/src/hooks/useGame.ts`

**Step 1: Add `placeTileFromRack` function**

This is like `placeTile` but takes an explicit rack index instead of using `selectedTileIndex`. Add after the `placeTile` function (after line 92):

```typescript
const placeTileFromRack = useCallback((row: number, col: number, rackIndex: number) => {
  if (!game || !isMyTurn) return;
  if (game.board[row][col].tile) return;
  if (tentativePlacements.some(t => t.row === row && t.col === col)) return;

  const tile = rack[rackIndex];
  if (!tile) return;

  if (tile.letter === '') {
    setPendingBlankPlacement({ row, col, rackIndex, originalTile: tile });
    return;
  }

  setTentativePlacements(prev => [
    ...prev,
    { row, col, letter: tile.letter, isBlank: false, rackIndex, originalTile: tile },
  ]);
  setRack(prev => prev.filter((_, i) => i !== rackIndex));
  setSelectedTileIndex(null);
}, [game, isMyTurn, rack, tentativePlacements]);
```

**Step 2: Add `moveTentative` function**

Add after `removeTentative` (after line 116):

```typescript
const moveTentative = useCallback((fromRow: number, fromCol: number, toRow: number, toCol: number) => {
  if (!game || !isMyTurn) return;
  if (game.board[toRow][toCol].tile) return;
  if (tentativePlacements.some(t => t.row === toRow && t.col === toCol)) return;

  setTentativePlacements(prev => prev.map(t =>
    t.row === fromRow && t.col === fromCol
      ? { ...t, row: toRow, col: toCol }
      : t
  ));
}, [game, isMyTurn, tentativePlacements]);
```

**Step 3: Export both new functions**

Add `placeTileFromRack` and `moveTentative` to the return object (around line 255).

**Step 4: Verify it compiles**

Run: `cd /home/lab/tmp/word-garden && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/client/src/hooks/useGame.ts
git commit -m "feat: add placeTileFromRack and moveTentative to useGame"
```

---

### Task 3: Integrate TileDragContext into useRackDrag

**Files:**
- Modify: `packages/client/src/hooks/useRackDrag.ts`

The hook needs to:
1. Accept new options: `tiles` (rack tiles array) and `startDrag`/`endDrag` callbacks from context
2. Call `startDrag` when a rack drag begins
3. Call `endDrag` when a drag ends
4. Skip `onReorder` if the pointer is outside all rack slots on drop (the tile was dragged to the board)

**Step 1: Update the interface and hook signature**

Add to `UseRackDragOptions`:

```typescript
interface UseRackDragOptions {
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
  tiles?: import('@word-garden/shared').Tile[];
  onDragStart?: (index: number) => void;
  onDragEnd?: () => void;
}
```

**Step 2: Update `onPointerMove` to call `onDragStart`**

In the `didDragRef.current` check block (where `didDragRef.current` is set to true), add:

```typescript
didDragRef.current = true;
suppressClickRef.current = true;
setDragState({ dragIndex: dragIndexRef.current, overIndex: dragIndexRef.current });
onDragStart?.(dragIndexRef.current);
```

**Step 3: Update `onPointerUp` to conditionally call `onReorder`**

Replace the current `onPointerUp`:

```typescript
const onPointerUp = useCallback(() => {
  if (dragIndexRef.current === null) return;

  if (didDragRef.current) {
    // Only reorder if dropped on a different rack slot
    if (overIndexRef.current !== null && dragIndexRef.current !== overIndexRef.current) {
      onReorder(dragIndexRef.current, overIndexRef.current);
    }
    onDragEnd?.();
  }

  cleanup();
}, [onReorder, cleanup, onDragEnd]);
```

**Step 4: Update `onPointerCancel`**

```typescript
const onPointerCancel = useCallback(() => {
  if (didDragRef.current) {
    onDragEnd?.();
  }
  cleanup();
}, [cleanup, onDragEnd]);
```

**Step 5: Verify it compiles**

Run: `cd /home/lab/tmp/word-garden && npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add packages/client/src/hooks/useRackDrag.ts
git commit -m "feat: integrate drag start/end callbacks into useRackDrag"
```

---

### Task 4: Wire up Rack component with TileDragContext

**Files:**
- Modify: `packages/client/src/components/Rack.tsx`
- Modify: `packages/client/src/components/Rack.module.css`

**Step 1: Update Rack.tsx**

Import the context hook and pass callbacks to `useRackDrag`:

```typescript
import { useCallback } from 'react';
import { Tile } from './Tile.js';
import { useRackDrag } from '../hooks/useRackDrag.js';
import { useTileDrag } from '../context/TileDragContext.js';
import styles from './Rack.module.css';
import type { Tile as TileType } from '@word-garden/shared';

interface RackProps {
  tiles: TileType[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onShuffle: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  exchangeMode?: boolean;
  exchangeSelection?: Set<number>;
}

export function Rack({ tiles, selectedIndex, onSelect, onShuffle, onReorder, exchangeMode, exchangeSelection }: RackProps) {
  const { dragState: tileDragState, startDrag, endDrag } = useTileDrag();

  const handleDragStart = useCallback((index: number) => {
    startDrag({ tile: tiles[index], source: { type: 'rack', index } });
  }, [tiles, startDrag]);

  const { dragState, suppressClickRef, setSlotRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, getSlotStyle } = useRackDrag({
    onReorder,
    disabled: exchangeMode,
    onDragStart: handleDragStart,
    onDragEnd: endDrag,
  });

  const handleClick = useCallback((index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(index);
  }, [onSelect, suppressClickRef]);

  // Show drop target highlight when dragging a board tile over the rack
  const isRackDropTarget = tileDragState?.source.type === 'board';

  return (
    <div className={styles.rackContainer}>
      <div className={`${styles.rack}${isRackDropTarget ? ` ${styles.rackDropTarget}` : ''}`}>
        {tiles.map((tile, i) => {
          const isDragging = dragState.dragIndex === i;
          const slotClass = `${styles.rackSlot}${isDragging ? ` ${styles.lifting}` : ''}`;

          return (
            <div
              key={i}
              ref={(el) => setSlotRef(i, el)}
              className={slotClass}
              style={getSlotStyle(i)}
              onPointerDown={(e) => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <Tile
                letter={tile.letter}
                points={tile.points}
                selected={exchangeMode ? exchangeSelection?.has(i) : selectedIndex === i}
                onClick={() => handleClick(i)}
              />
            </div>
          );
        })}
      </div>
      <button onClick={onShuffle} className={styles.shuffleButton} title="Shuffle tiles">
        Shuffle
      </button>
    </div>
  );
}
```

**Step 2: Add `.rackDropTarget` CSS class to Rack.module.css**

Add after the `.lifting` rule:

```css
.rackDropTarget {
  outline: 2px dashed var(--color-accent, #7aab30);
  outline-offset: 2px;
}
```

**Step 3: Verify it compiles**

Run: `cd /home/lab/tmp/word-garden && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/Rack.tsx packages/client/src/components/Rack.module.css
git commit -m "feat: wire Rack component with TileDragContext"
```

---

### Task 5: Add drag-and-drop to Board component

**Files:**
- Modify: `packages/client/src/components/Board.tsx`
- Modify: `packages/client/src/components/Board.module.css`

This is the largest task. The Board needs to:
1. Be a drop target for rack-to-board drags (highlight hovered cell, accept drop)
2. Be a drag source for tentative tiles (board-to-rack, board-to-board)
3. Track pointer position for cell hit testing during drag

**Step 1: Update Board.tsx**

```typescript
import { useState, useRef, useCallback } from 'react';
import { Tile } from './Tile.js';
import { useTileDrag } from '../context/TileDragContext.js';
import styles from './Board.module.css';
import { LETTER_POINTS } from '@word-garden/shared';
import type { BoardCell, TilePlacement, Tile as TileType } from '@word-garden/shared';

interface BoardProps {
  board: BoardCell[][];
  tentativePlacements: TilePlacement[];
  onCellClick: (row: number, col: number) => void;
  onDropFromRack?: (row: number, col: number, rackIndex: number) => void;
  onMoveTentative?: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onReturnToRack?: (row: number, col: number) => void;
  lastMoveTiles?: TilePlacement[];
  isMyTurn?: boolean;
}

const PREMIUM_LABELS: Record<string, string> = {
  TW: 'TW',
  DW: 'DW',
  TL: 'TL',
  DL: 'DL',
};

export function Board({ board, tentativePlacements, onCellClick, onDropFromRack, onMoveTentative, onReturnToRack, lastMoveTiles = [], isMyTurn }: BoardProps) {
  const tentativeMap = new Map(tentativePlacements.map(t => [`${t.row},${t.col}`, t]));
  const lastMoveSet = new Set(lastMoveTiles.map(t => `${t.row},${t.col}`));
  const { dragState, startDrag, endDrag } = useTileDrag();
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Track which cell the pointer is over during a drag
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const rect = boardEl.getBoundingClientRect();
    const x = e.clientX - rect.left - 4; // subtract padding
    const y = e.clientY - rect.top - 4;
    const cellSize = (rect.width - 8) / 15; // subtract padding both sides
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (row >= 0 && row < 15 && col >= 0 && col < 15) {
      const cell = board[row][col];
      const hasTentative = tentativeMap.has(`${row},${col}`);
      // Only highlight empty cells that don't already have a tile
      if (!cell.tile && !hasTentative) {
        setHoverCell({ row, col });
      } else {
        setHoverCell(null);
      }
    } else {
      setHoverCell(null);
    }
  }, [dragState, board, tentativeMap]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState || !hoverCell) return;
    const { row, col } = hoverCell;

    if (dragState.source.type === 'rack' && onDropFromRack) {
      onDropFromRack(row, col, dragState.source.index);
    } else if (dragState.source.type === 'board' && onMoveTentative) {
      onMoveTentative(dragState.source.row, dragState.source.col, row, col);
    }

    setHoverCell(null);
    endDrag();
  }, [dragState, hoverCell, onDropFromRack, onMoveTentative, endDrag]);

  const handlePointerLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  // Start dragging a tentative tile
  const handleTentativePointerDown = useCallback((e: React.PointerEvent, row: number, col: number, tentative: TilePlacement) => {
    if (!isMyTurn) return;
    e.stopPropagation();
    const tile: TileType = { letter: tentative.letter, points: tentative.isBlank ? 0 : (LETTER_POINTS.get(tentative.letter.toUpperCase()) ?? 0) };
    startDrag({ tile, source: { type: 'board', row, col } });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isMyTurn, startDrag]);

  // Handle pointer up on board when dragging a board tile — if it lands outside valid cells,
  // return it to rack
  const handleBoardTilePointerUp = useCallback(() => {
    if (!dragState || dragState.source.type !== 'board') return;

    if (hoverCell) {
      // Dropped on a valid cell — move tentative tile
      if (onMoveTentative) {
        onMoveTentative(dragState.source.row, dragState.source.col, hoverCell.row, hoverCell.col);
      }
    }
    // If no hoverCell, the drop is handled by the rack (or cancelled)
    // The rack's pointer events or the game-level handler will deal with it

    setHoverCell(null);
    endDrag();
  }, [dragState, hoverCell, onMoveTentative, endDrag]);

  return (
    <div
      ref={boardRef}
      className={styles.board}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {board.map((row, r) =>
        row.map((cell, c) => {
          const tentative = tentativeMap.get(`${r},${c}`);
          const isLastMove = lastMoveSet.has(`${r},${c}`);
          const premiumClass = cell.premium ? styles[`premium${cell.premium}`] : '';
          const isCenter = r === 7 && c === 7;
          const isHovered = hoverCell?.row === r && hoverCell?.col === c;

          return (
            <div
              key={`${r}-${c}`}
              className={`${styles.cell} ${premiumClass} ${isLastMove ? styles.lastMove : ''} ${isHovered ? styles.dropHover : ''}`}
              onClick={() => onCellClick(r, c)}
            >
              {cell.tile ? (
                <Tile letter={cell.tile.letter} points={cell.tile.points} />
              ) : tentative ? (
                <div
                  onPointerDown={(e) => handleTentativePointerDown(e, r, c, tentative)}
                  onPointerUp={handleBoardTilePointerUp}
                  style={{ width: '100%', height: '100%' }}
                >
                  <Tile letter={tentative.letter} points={tentative.isBlank ? 0 : (LETTER_POINTS.get(tentative.letter.toUpperCase()) ?? 0)} tentative />
                </div>
              ) : (
                <span className={styles.premiumLabel}>
                  {cell.premium ? PREMIUM_LABELS[cell.premium] : isCenter ? '\u2605' : ''}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
```

**Step 2: Add `.dropHover` CSS class to Board.module.css**

Add after the `.lastMove` rule:

```css
.dropHover {
  background: rgba(122, 171, 48, 0.3) !important;
  box-shadow: inset 0 0 0 2px rgba(122, 171, 48, 0.6);
}
```

**Step 3: Verify it compiles**

Run: `cd /home/lab/tmp/word-garden && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/components/Board.tsx packages/client/src/components/Board.module.css
git commit -m "feat: add drag-and-drop support to Board component"
```

---

### Task 6: Wire everything together in Game.tsx

**Files:**
- Modify: `packages/client/src/pages/Game.tsx`

**Step 1: Update Game.tsx**

Wrap the game content with `TileDragProvider` and pass new props to Board:

```typescript
import { useParams, useNavigate } from 'react-router';
import { Board } from '../components/Board.js';
import { Rack } from '../components/Rack.js';
import { BlankTilePicker } from '../components/BlankTilePicker.js';
import { TileDragProvider } from '../context/TileDragContext.js';
import { useGame } from '../hooks/useGame.js';
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

        {!isFinished && (
          <Rack
            tiles={rack}
            selectedIndex={exchangeMode ? null : selectedTileIndex}
            onSelect={exchangeMode ? toggleExchangeTile : (i) => setSelectedTileIndex(prev => prev === i ? null : i)}
            onShuffle={shuffleRack}
            onReorder={reorderRack}
            exchangeMode={exchangeMode}
            exchangeSelection={exchangeSelection}
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
```

Key changes from current Game.tsx:
- Import and wrap with `TileDragProvider`
- Destructure `placeTileFromRack`, `moveTentative`, `removeTentative` from useGame
- Pass `onDropFromRack`, `onMoveTentative`, `onReturnToRack`, `isMyTurn` to Board

**Step 2: Export `removeTentative` from useGame**

In `packages/client/src/hooks/useGame.ts`, add `removeTentative` to the return object (it already exists as a function but is not exported directly — it's only used inside `onCellClick`).

**Step 3: Verify it compiles**

Run: `cd /home/lab/tmp/word-garden && npm run build`
Expected: Build succeeds

**Step 4: Test manually**

Run: `cd /home/lab/tmp/word-garden/packages/client && npm run dev`

Test these interactions:
1. **Rack to Board**: Drag a rack tile onto an empty board cell — tile should be placed
2. **Board to Board**: Drag a tentative tile to a different empty cell — tile should relocate
3. **Click-to-place still works**: Click a rack tile, click a board cell — still places tile
4. **Click to return still works**: Click a tentative tile on the board — still returns to rack
5. **Board cell highlights**: When dragging over the board, empty cells under the pointer should highlight green
6. **Rack reorder still works**: Drag a rack tile onto another rack tile — still reorders
7. **Blank tiles**: Drag a blank tile from rack to board — should open the letter picker modal

**Step 5: Commit**

```bash
git add packages/client/src/pages/Game.tsx packages/client/src/hooks/useGame.ts
git commit -m "feat: wire board drag-and-drop in Game page with TileDragProvider"
```

---

### Task 7: Handle board-to-rack drop

**Files:**
- Modify: `packages/client/src/components/Rack.tsx`

When a board tile is being dragged and the pointer enters the rack area, dropping should return the tile to the rack. The Rack component needs to listen for pointer events when a board drag is active.

**Step 1: Update Rack.tsx**

Add a `onReturnToRack` prop and pointer handlers for the rack container:

Add to `RackProps`:

```typescript
interface RackProps {
  tiles: TileType[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onShuffle: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  exchangeMode?: boolean;
  exchangeSelection?: Set<number>;
  onReturnToRack?: (row: number, col: number) => void;
}
```

Add a handler for dropping board tiles on the rack:

```typescript
const handleRackPointerUp = useCallback(() => {
  if (tileDragState?.source.type === 'board' && onReturnToRack) {
    onReturnToRack(tileDragState.source.row, tileDragState.source.col);
    endDrag();
  }
}, [tileDragState, onReturnToRack, endDrag]);
```

Add `onPointerUp={handleRackPointerUp}` to the `.rack` div:

```tsx
<div
  className={`${styles.rack}${isRackDropTarget ? ` ${styles.rackDropTarget}` : ''}`}
  onPointerUp={handleRackPointerUp}
>
```

**Step 2: Pass `onReturnToRack` from Game.tsx**

In Game.tsx, add the prop to the Rack component:

```tsx
<Rack
  tiles={rack}
  selectedIndex={exchangeMode ? null : selectedTileIndex}
  onSelect={exchangeMode ? toggleExchangeTile : (i) => setSelectedTileIndex(prev => prev === i ? null : i)}
  onShuffle={shuffleRack}
  onReorder={reorderRack}
  exchangeMode={exchangeMode}
  exchangeSelection={exchangeSelection}
  onReturnToRack={removeTentative}
/>
```

**Step 3: Verify it compiles and test**

Run: `cd /home/lab/tmp/word-garden && npm run build`

Test: Drag a tentative board tile down to the rack area — it should return to the rack.

**Step 4: Commit**

```bash
git add packages/client/src/components/Rack.tsx packages/client/src/pages/Game.tsx
git commit -m "feat: handle board-to-rack tile drop on Rack component"
```
