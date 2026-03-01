import { describe, it, expect, vi } from 'vitest';
import { updateRatings } from '../ratings.js';

// Mock glicko2
vi.mock('../glicko2.js', () => ({
  calculateNewRatings: vi.fn(() => ({
    player1: { rating: 1547, deviation: 190, volatility: 0.059 },
    player2: { rating: 1453, deviation: 190, volatility: 0.059 },
  })),
}));

function createMockClient() {
  const queryResults: any[] = [];
  const client = {
    query: vi.fn(async () => queryResults.shift() ?? { rows: [] }),
    pushResult: (result: any) => queryResults.push(result),
  };
  return client;
}

describe('updateRatings', () => {
  it('returns rating and rank changes for both players', async () => {
    const client = createMockClient();
    // SELECT FOR UPDATE player1 (sorted first by id)
    client.pushResult({ rows: [{ id: 'aaa', rating: 1500, rating_deviation: 200, rating_volatility: 0.06 }] });
    // SELECT FOR UPDATE player2
    client.pushResult({ rows: [{ id: 'bbb', rating: 1500, rating_deviation: 200, rating_volatility: 0.06 }] });
    // Rank query for player1 before
    client.pushResult({ rows: [{ count: '2' }] });
    // Rank query for player2 before
    client.pushResult({ rows: [{ count: '2' }] });
    // UPDATE player1 rating
    client.pushResult({ rows: [] });
    // UPDATE player2 rating
    client.pushResult({ rows: [] });
    // Rank query for player1 after
    client.pushResult({ rows: [{ count: '1' }] });
    // Rank query for player2 after
    client.pushResult({ rows: [{ count: '3' }] });

    const result = await updateRatings(client as any, 'aaa', 'bbb', 'aaa');

    expect(result).toBeDefined();
    expect(result!.player1.ratingBefore).toBe(1500);
    expect(result!.player1.ratingAfter).toBe(1547);
    expect(result!.player1.rankBefore).toBe(3);
    expect(result!.player1.rankAfter).toBe(2);
    expect(result!.player2.ratingBefore).toBe(1500);
    expect(result!.player2.ratingAfter).toBe(1453);
    expect(result!.player2.rankBefore).toBe(3);
    expect(result!.player2.rankAfter).toBe(4);
  });

  it('returns undefined when player ids are null', async () => {
    const client = createMockClient();
    const result = await updateRatings(client as any, null, 'bbb', null);
    expect(result).toBeUndefined();
  });
});
