import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tile } from './Tile.js';

describe('Tile blank styling', () => {
  it('applies a blank class when isBlank is set', () => {
    const { container } = render(<Tile letter="A" points={0} isBlank />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/blank/);
  });

  it('does not apply the blank class for a normal tile', () => {
    const { container } = render(<Tile letter="A" points={1} />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toMatch(/blank/);
  });
});
