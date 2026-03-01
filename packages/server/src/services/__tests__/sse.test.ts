import { describe, it, expect, vi, beforeEach } from 'vitest';

let addClient: typeof import('../sse.js').addClient;
let sendEvent: typeof import('../sse.js').sendEvent;
let broadcastEvent: typeof import('../sse.js').broadcastEvent;
let disconnectUser: typeof import('../sse.js').disconnectUser;
let closeAllConnections: typeof import('../sse.js').closeAllConnections;
let isAtCapacity: typeof import('../sse.js').isAtCapacity;

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
});
