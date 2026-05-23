import { describe, it, expect, vi, beforeEach } from 'vitest';

const connect = vi.fn();
vi.mock('../../db/pool.js', () => ({ default: { connect } }));
vi.mock('../sse.js', () => ({ sendEvent: vi.fn(), broadcastLobbyStats: vi.fn() }));
vi.mock('../gameEngine.js', () => ({
  initializeGame: () => ({ board: [], tileBag: [], player1Rack: [] }),
  drawTilesForPlayer2: () => ({ rack: [], remainingBag: [] }),
}));

let enterQueue: typeof import('../matchmaking.js').enterQueue;

function mockClient(steps: any[]) {
  let i = 0;
  return {
    query: vi.fn(async () => steps[i++] ?? { rows: [] }),
    release: vi.fn(),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  enterQueue = (await import('../matchmaking.js')).enterQueue;
});

describe('enterQueue', () => {
  it('enqueues the searcher when no eligible candidate exists', async () => {
    const client = mockClient([
      { rows: [] },                       // BEGIN
      { rows: [{ acquired: true }] },     // advisory lock
      { rows: [] },                       // match query -> no eligible candidate
      { rows: [] },                       // INSERT into matchmaking_queue
      { rows: [] },                       // COMMIT
      { rows: [] },                       // advisory unlock
    ]);
    connect.mockResolvedValue(client);

    const result = await enterQueue('u1', 1500, 200);

    expect(result).toEqual({ matched: false });
    const sqls = client.query.mock.calls.map((c: any[]) => c[0] as string);
    expect(sqls.some(s => /NOT EXISTS/.test(s))).toBe(true);                 // candidate query filters existing opponents
    expect(sqls.some(s => /INSERT INTO matchmaking_queue/.test(s))).toBe(true); // searcher enqueued, not dropped
  });

  it('creates a game when an eligible candidate is found', async () => {
    const client = mockClient([
      { rows: [] },                                            // BEGIN
      { rows: [{ acquired: true }] },                          // advisory lock
      { rows: [{ id: 'q2', user_id: 'u2', rating: 1500 }] },   // match query
      { rows: [] },                                            // DELETE opponent
      { rows: [] },                                            // DELETE self
      { rows: [{ id: 'g1' }] },                                // INSERT games
      { rows: [] },                                            // COMMIT
      { rows: [] },                                            // advisory unlock
    ]);
    connect.mockResolvedValue(client);

    const result = await enterQueue('u1', 1500, 200);
    expect(result).toEqual({ matched: true, gameId: 'g1' });
  });
});
