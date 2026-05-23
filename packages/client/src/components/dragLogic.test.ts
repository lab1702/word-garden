import { describe, it, expect } from 'vitest';
import { resolveDrop } from './dragLogic.js';

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
