import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/pool.js', () => ({
  default: { query: vi.fn() },
}));

let addClient: typeof import('../sse.js').addClient;
let sendEvent: typeof import('../sse.js').sendEvent;
let broadcastEvent: typeof import('../sse.js').broadcastEvent;
let disconnectUser: typeof import('../sse.js').disconnectUser;
let closeAllConnections: typeof import('../sse.js').closeAllConnections;
let isAtCapacity: typeof import('../sse.js').isAtCapacity;
let getOnlinePlayerCount: typeof import('../sse.js').getOnlinePlayerCount;
let broadcastLobbyStats: typeof import('../sse.js').broadcastLobbyStats;
let sendLobbyStats: typeof import('../sse.js').sendLobbyStats;

function mockResponse() {
  return {
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as any;
}

describe('sse', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../sse.js');
    addClient = mod.addClient;
    sendEvent = mod.sendEvent;
    broadcastEvent = mod.broadcastEvent;
    disconnectUser = mod.disconnectUser;
    closeAllConnections = mod.closeAllConnections;
    isAtCapacity = mod.isAtCapacity;
    getOnlinePlayerCount = mod.getOnlinePlayerCount;
    broadcastLobbyStats = mod.broadcastLobbyStats;
    sendLobbyStats = mod.sendLobbyStats;
  });

  it('sends event to connected client', () => {
    const res = mockResponse();
    addClient('user-1', res);
    sendEvent('user-1', 'test', { hello: 'world' });
    expect(res.write).toHaveBeenCalledWith('event: test\ndata: {"hello":"world"}\n\n');
  });

  it('does nothing for non-existent user', () => {
    expect(() => sendEvent('nonexistent', 'test', {})).not.toThrow();
  });

  it('evicts oldest client beyond MAX_CONNECTIONS_PER_USER', () => {
    const responses = Array.from({ length: 6 }, () => mockResponse());
    for (const res of responses) addClient('user-1', res);
    expect(responses[0].end).toHaveBeenCalled();
    expect(responses[5].end).not.toHaveBeenCalled();
  });

  it('disconnectUser ends all connections', () => {
    const r1 = mockResponse(), r2 = mockResponse();
    addClient('user-1', r1);
    addClient('user-1', r2);
    disconnectUser('user-1');
    expect(r1.end).toHaveBeenCalled();
    expect(r2.end).toHaveBeenCalled();
  });

  it('removes client on write error', () => {
    const res = mockResponse();
    res.write.mockImplementation(() => { throw new Error('closed'); });
    addClient('user-1', res);
    sendEvent('user-1', 'test', {});
    res.write.mockClear();
    sendEvent('user-1', 'test', {});
    expect(res.write).not.toHaveBeenCalled();
  });

  it('closeAllConnections ends everything', () => {
    const r1 = mockResponse(), r2 = mockResponse();
    addClient('user-1', r1);
    addClient('user-2', r2);
    closeAllConnections();
    expect(r1.end).toHaveBeenCalled();
    expect(r2.end).toHaveBeenCalled();
  });

  it('isAtCapacity returns false under normal usage', () => {
    addClient('user-1', mockResponse());
    expect(isAtCapacity()).toBe(false);
  });

  it('disconnectUser decrements global count correctly', () => {
    const r1 = mockResponse(), r2 = mockResponse();
    addClient('user-1', r1);
    addClient('user-1', r2);
    disconnectUser('user-1');
    // After disconnect, adding a new client should still work (not at capacity)
    expect(isAtCapacity()).toBe(false);
  });

  it('disconnectUser broadcasts updated lobby stats', async () => {
    const { default: pool } = await import('../../db/pool.js');
    (pool.query as any).mockResolvedValue({ rows: [{ count: 0 }] });

    const r1 = mockResponse();
    const r2 = mockResponse();
    addClient('user-1', r1);
    addClient('user-2', r2);

    // Wait for the addClient broadcast to flush
    await vi.waitFor(() => {
      expect(r2.write).toHaveBeenCalledWith(
        expect.stringContaining('"onlinePlayers":2')
      );
    }, { timeout: 1000 });

    r2.write.mockClear();

    disconnectUser('user-1');

    await vi.waitFor(() => {
      expect(r2.write).toHaveBeenCalledWith(
        expect.stringContaining('"onlinePlayers":1')
      );
    }, { timeout: 1000 });
  });

  it('closeAllConnections resets global count', () => {
    addClient('user-1', mockResponse());
    addClient('user-2', mockResponse());
    closeAllConnections();
    expect(isAtCapacity()).toBe(false);
  });

  it('sendEvent rejects event names with newlines', () => {
    expect(() => sendEvent('user-1', 'bad\nevent', {})).toThrow('Invalid SSE event name');
  });

  it('sendEvent rejects event names with carriage returns', () => {
    expect(() => sendEvent('user-1', 'bad\revent', {})).toThrow('Invalid SSE event name');
  });

  it('broadcastEvent rejects event names with newlines', () => {
    expect(() => broadcastEvent('bad\nevent', {})).toThrow('Invalid SSE event name');
  });

  it('getOnlinePlayerCount returns unique user count', () => {
    addClient('user-1', mockResponse());
    addClient('user-1', mockResponse()); // same user, two connections
    addClient('user-2', mockResponse());
    expect(getOnlinePlayerCount()).toBe(2);
  });

  it('getOnlinePlayerCount returns 0 when no clients', () => {
    expect(getOnlinePlayerCount()).toBe(0);
  });

  it('broadcastLobbyStats sends lobby_stats to all clients', async () => {
    const { default: pool } = await import('../../db/pool.js');
    (pool.query as any).mockResolvedValue({ rows: [{ count: 3 }] });

    const r1 = mockResponse();
    const r2 = mockResponse();
    addClient('user-1', r1);
    addClient('user-2', r2);

    broadcastLobbyStats();

    // Wait for debounce (500ms) + async
    await vi.waitFor(() => {
      expect(r1.write).toHaveBeenCalledWith(
        expect.stringContaining('"onlinePlayers":2')
      );
    }, { timeout: 1000 });

    expect(r2.write).toHaveBeenCalledWith(
      expect.stringContaining('"matchmakingPlayers":3')
    );
  });

  it('sendLobbyStats sends lobby_stats to specific user', async () => {
    const { default: pool } = await import('../../db/pool.js');
    (pool.query as any).mockResolvedValue({ rows: [{ count: 1 }] });

    const res = mockResponse();
    addClient('user-1', res);

    await sendLobbyStats('user-1');

    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"onlinePlayers":1')
    );
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"matchmakingPlayers":1')
    );
  });
});
