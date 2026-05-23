import { describe, it, expect, vi, beforeEach } from 'vitest';

const connect = vi.fn();
vi.mock('../../db/pool.js', () => ({ default: { connect } }));
vi.mock('../gameEngine.js', () => ({
  initializeGame: () => ({ board: [], tileBag: [], player1Rack: [] }),
}));
vi.mock('../matchmaking.js', () => ({ generateInviteCode: () => 'GARDEN-ABC234' }));

let createWaitingGame: typeof import('../inviteGames.js').createWaitingGame;
let WaitingGameLimitError: typeof import('../inviteGames.js').WaitingGameLimitError;

function mockClient(steps: any[]) {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const step = steps[i++] ?? { rows: [] };
      if (step && step.throw) throw step.throw;
      return step;
    }),
    release: vi.fn(),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../inviteGames.js');
  createWaitingGame = mod.createWaitingGame;
  WaitingGameLimitError = mod.WaitingGameLimitError;
});

describe('createWaitingGame', () => {
  it('acquires a per-user advisory lock before counting, then inserts', async () => {
    const client = mockClient([
      { rows: [] },                                              // BEGIN
      { rows: [] },                                              // pg_advisory_xact_lock
      { rows: [{ count: '0' }] },                               // COUNT
      { rows: [] },                                              // SAVEPOINT
      { rows: [{ id: 'g1', invite_code: 'GARDEN-ABC234' }] },   // INSERT
      { rows: [] },                                              // RELEASE SAVEPOINT
      { rows: [] },                                              // COMMIT
    ]);
    connect.mockResolvedValue(client);

    const result = await createWaitingGame('u1');

    expect(result).toEqual({ id: 'g1', inviteCode: 'GARDEN-ABC234' });
    const sqls = client.query.mock.calls.map((c: any[]) => c[0] as string);
    const lockIdx = sqls.findIndex(s => /pg_advisory_xact_lock/.test(s));
    const countIdx = sqls.findIndex(s => /COUNT\(\*\)/.test(s));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(countIdx); // lock taken before the count
  });

  it('throws WaitingGameLimitError and does not insert when at the cap', async () => {
    const client = mockClient([
      { rows: [] },                 // BEGIN
      { rows: [] },                 // advisory lock
      { rows: [{ count: '5' }] },   // COUNT -> at cap
      { rows: [] },                 // ROLLBACK
    ]);
    connect.mockResolvedValue(client);

    await expect(createWaitingGame('u1')).rejects.toBeInstanceOf(WaitingGameLimitError);
    const sqls = client.query.mock.calls.map((c: any[]) => c[0] as string);
    expect(sqls.some(s => /INSERT INTO games/.test(s))).toBe(false);
  });
});
