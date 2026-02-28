import { describe, it, expect } from 'vitest';
import { calculateNewRatings } from '../glicko2.js';

describe('glicko2', () => {
  it('winner gains rating, loser drops', () => {
    const result = calculateNewRatings(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      { rating: 1500, deviation: 200, volatility: 0.06 },
      1, // player1 wins
    );
    expect(result.player1.rating).toBeGreaterThan(1500);
    expect(result.player2.rating).toBeLessThan(1500);
  });

  it('deviation decreases after a game', () => {
    const result = calculateNewRatings(
      { rating: 1500, deviation: 350, volatility: 0.06 },
      { rating: 1500, deviation: 350, volatility: 0.06 },
      1,
    );
    expect(result.player1.deviation).toBeLessThan(350);
    expect(result.player2.deviation).toBeLessThan(350);
  });

  it('upset produces larger rating change', () => {
    const expected = calculateNewRatings(
      { rating: 1200, deviation: 100, volatility: 0.06 },
      { rating: 1800, deviation: 100, volatility: 0.06 },
      1, // lower-rated player wins (upset)
    );
    const normal = calculateNewRatings(
      { rating: 1800, deviation: 100, volatility: 0.06 },
      { rating: 1200, deviation: 100, volatility: 0.06 },
      1, // higher-rated player wins (expected)
    );
    const upsetGain = expected.player1.rating - 1200;
    const normalGain = normal.player1.rating - 1800;
    expect(upsetGain).toBeGreaterThan(normalGain);
  });

  it('handles draw', () => {
    const result = calculateNewRatings(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      { rating: 1500, deviation: 200, volatility: 0.06 },
      0, // draw
    );
    // Equal players draw — ratings should stay close to 1500
    expect(Math.abs(result.player1.rating - 1500)).toBeLessThan(1);
  });
});
