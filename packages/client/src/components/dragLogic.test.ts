import { describe, it, expect } from 'vitest';
import { resolveDrop, dragTileScale, dragTileTranslate } from './dragLogic.js';

describe('resolveDrop', () => {
  it('places a rack tile on an empty board cell', () => {
    expect(resolveDrop({ row: 3, col: 4 }, false, { type: 'rack', index: 2 }))
      .toEqual({ action: 'placeFromRack', row: 3, col: 4, rackIndex: 2 });
  });

  it('moves a tentative tile to an empty board cell', () => {
    expect(resolveDrop({ row: 3, col: 4 }, false, { type: 'board', row: 1, col: 1 }))
      .toEqual({ action: 'moveTentative', fromRow: 1, fromCol: 1, toRow: 3, toCol: 4 });
  });

  it('does nothing when dropped on a blocked board cell', () => {
    expect(resolveDrop({ row: 3, col: 4 }, true, { type: 'board', row: 1, col: 1 }))
      .toEqual({ action: 'none' });
  });

  it('returns a board tile to the rack when dropped off the board', () => {
    expect(resolveDrop(null, false, { type: 'board', row: 1, col: 1 }))
      .toEqual({ action: 'returnToRack', row: 1, col: 1 });
  });

  it('does nothing when a rack tile is dropped off the board', () => {
    expect(resolveDrop(null, false, { type: 'rack', index: 2 }))
      .toEqual({ action: 'none' });
  });
});

describe('dragTileScale', () => {
  it('shrinks a rack tile to the board cell size', () => {
    // 72px rack tile, 45px board cell -> scale to 0.625
    expect(dragTileScale(45, 72)).toBe(0.625);
  });

  it('falls back to the lift cue when the board cell is unmeasurable', () => {
    expect(dragTileScale(0, 72)).toBe(1.05);
  });

  it('falls back to the lift cue when the rack slot is unmeasurable', () => {
    expect(dragTileScale(45, 0)).toBe(1.05);
  });
});

describe('dragTileTranslate', () => {
  it('centers the tile on the cursor by translating its center onto the pointer', () => {
    expect(dragTileTranslate({ x: 200, y: 150 }, { x: 120, y: 110 }))
      .toEqual({ x: 80, y: 40 });
  });

  it('returns a negative offset when the cursor is left/above the slot center', () => {
    expect(dragTileTranslate({ x: 100, y: 100 }, { x: 130, y: 160 }))
      .toEqual({ x: -30, y: -60 });
  });
});
