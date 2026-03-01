import { describe, it, expect, vi, beforeEach } from 'vitest';

let addClient: typeof import('../sse.js').addClient;
let sendEvent: typeof import('../sse.js').sendEvent;
let disconnectUser: typeof import('../sse.js').disconnectUser;
let closeAllConnections: typeof import('../sse.js').closeAllConnections;

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
    disconnectUser = mod.disconnectUser;
    closeAllConnections = mod.closeAllConnections;
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
});
