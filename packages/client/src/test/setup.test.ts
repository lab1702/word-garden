import { describe, it, expect } from 'vitest';

describe('client test harness', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
