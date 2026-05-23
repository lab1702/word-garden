import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Rack } from './Rack.js';
import { TileDragProvider } from '../context/TileDragContext.js';
import type { RackTile } from '../hooks/useGame.js';

const tiles: RackTile[] = [
  { _id: 0, letter: 'A', points: 1 },
  { _id: 1, letter: 'B', points: 3 },
  { _id: 2, letter: 'C', points: 3 },
];

function rect(width: number, left = 0, top = 0): DOMRect {
  return { x: left, y: top, left, top, width, height: width, right: left + width, bottom: top + width, toJSON: () => ({}) } as DOMRect;
}

let origGBCR: () => DOMRect;

beforeEach(() => {
  // jsdom lacks PointerEvent; without it fireEvent.pointer* dispatches a plain
  // Event with no button/clientX, so the hook's drag never starts. MouseEvent
  // carries those init props, so extend it.
  if (typeof window.PointerEvent === 'undefined') {
    class FakePointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 1;
      }
    }
    window.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent;
  }
  // jsdom doesn't implement pointer capture; the hook calls it on drag start.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  // jsdom returns zero-sized rects, so stub sizes: rack slots 72px, board cell 36px.
  origGBCR = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.dataset?.row !== undefined) return rect(36); // a board cell
    if (String(this.className).includes('rackSlot')) return rect(72); // a rack slot
    return rect(0);
  };
  // The hook measures a board cell via [data-row][data-col]; provide one.
  const cell = document.createElement('div');
  cell.dataset.row = '0';
  cell.dataset.col = '0';
  cell.id = 'test-board-cell';
  document.body.appendChild(cell);
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = origGBCR;
  document.getElementById('test-board-cell')?.remove();
  vi.restoreAllMocks();
});

describe('Rack drag visuals', () => {
  it('shrinks the dragged tile to board-cell size and centers it on the cursor', () => {
    const { container } = render(
      <TileDragProvider>
        <Rack
          tiles={tiles}
          selectedIndex={null}
          onSelect={() => {}}
          onShuffle={() => {}}
          onReorder={() => {}}
        />
      </TileDragProvider>,
    );

    const slot = container.querySelector('[class*="rackSlot"]') as HTMLElement;
    expect(slot).toBeTruthy();

    // Grab near the slot, then drag past the 5px threshold to (100, 50).
    fireEvent.pointerDown(slot, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerMove(slot, { clientX: 100, clientY: 50, pointerId: 1 });

    // Board cell 36 / rack slot 72 -> scale 0.5. Slot center (36,36); cursor
    // (100,50) -> translate (64, 14) so the tile's center sits on the cursor.
    expect(slot.style.transform).toBe('translate(64px, 14px) scale(0.5)');
  });
});
