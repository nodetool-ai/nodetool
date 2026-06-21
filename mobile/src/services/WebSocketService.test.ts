/**
 * Tests for the WebSocketService router that wraps WebSocketManager.
 * WebSocketManager is mocked so we can assert delegation + routing in isolation.
 */

interface MockManagerShape {
  config: { url: string; headers?: Record<string, string> };
  callbacks: Record<string, ((...args: unknown[]) => void) | undefined>;
  connected: boolean;
  sent: unknown[];
  destroyed: boolean;
  setCallbacks: (cb: Record<string, unknown>) => void;
  isConnected: () => boolean;
  connect: () => Promise<void>;
  send: (msg: unknown) => void;
  destroy: () => void;
  emit: (data: Record<string, unknown>) => void;
}

jest.mock('./WebSocketManager', () => {
  const instances: MockManagerShape[] = [];
  class MockWebSocketManager {
    static instances = instances;
    config: { url: string; headers?: Record<string, string> };
    callbacks: Record<string, ((...args: unknown[]) => void) | undefined> = {};
    connected = false;
    sent: unknown[] = [];
    destroyed = false;
    constructor(config: { url: string; headers?: Record<string, string> }) {
      this.config = config;
      instances.push(this as unknown as MockManagerShape);
    }
    setCallbacks(cb: Record<string, (...args: unknown[]) => void>) {
      this.callbacks = { ...this.callbacks, ...cb };
    }
    isConnected() {
      return this.connected;
    }
    async connect() {
      this.connected = true;
      this.callbacks.onOpen?.();
    }
    send(msg: unknown) {
      this.sent.push(msg);
    }
    destroy() {
      this.destroyed = true;
      this.connected = false;
    }
    emit(data: Record<string, unknown>) {
      this.callbacks.onMessage?.(data);
    }
  }
  return { WebSocketManager: MockWebSocketManager };
});

jest.mock('./api', () => ({
  apiService: { getWebSocketUrl: (path: string) => `ws://test.local${path}` },
}));

jest.mock('../stores/AuthStore', () => ({
  useAuthStore: { getState: () => ({ session: { access_token: 'tok-123' } }) },
}));

import { webSocketService } from './WebSocketService';
import { WebSocketManager } from './WebSocketManager';

function managerInstances(): MockManagerShape[] {
  return (WebSocketManager as unknown as { instances: MockManagerShape[] }).instances;
}

function latestManager(): MockManagerShape {
  const all = managerInstances();
  return all[all.length - 1];
}

beforeEach(() => {
  managerInstances().length = 0;
  webSocketService.disconnect();
});

describe('WebSocketService', () => {
  it('connects with the auth token in an Authorization header, not the url', async () => {
    await webSocketService.ensureConnection('/ws');

    expect(managerInstances()).toHaveLength(1);
    expect(latestManager().config.url).toBe('ws://test.local/ws');
    expect(latestManager().config.headers).toEqual({ Authorization: 'Bearer tok-123' });
    expect(latestManager().isConnected()).toBe(true);
  });

  it('reuses a single connection for concurrent ensureConnection calls', async () => {
    await Promise.all([
      webSocketService.ensureConnection('/ws'),
      webSocketService.ensureConnection('/ws'),
    ]);

    expect(managerInstances()).toHaveLength(1);
  });

  it('routes a message to the subscriber for its workflow_id', async () => {
    await webSocketService.ensureConnection('/ws');
    const received: Record<string, unknown>[] = [];
    const unsubscribe = webSocketService.subscribe('wf-1', (m) => received.push(m));

    latestManager().emit({ type: 'node_update', workflow_id: 'wf-1', status: 'running' });

    expect(received).toHaveLength(1);
    expect(received[0].status).toBe('running');
    unsubscribe();
  });

  it('invokes a handler once when a message matches multiple routing keys', async () => {
    await webSocketService.ensureConnection('/ws');
    const handler = jest.fn();
    // Same handler subscribed to both ids — mirrors WorkflowRunner subscribing
    // to workflow_id and then job_id.
    const u1 = webSocketService.subscribe('wf-1', handler);
    const u2 = webSocketService.subscribe('job-1', handler);

    latestManager().emit({ type: 'job_update', workflow_id: 'wf-1', job_id: 'job-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });

  it('does not route to a handler after it unsubscribes', async () => {
    await webSocketService.ensureConnection('/ws');
    const handler = jest.fn();
    const unsubscribe = webSocketService.subscribe('wf-1', handler);
    unsubscribe();

    latestManager().emit({ type: 'node_update', workflow_id: 'wf-1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores messages with no routing key', async () => {
    await webSocketService.ensureConnection('/ws');
    const handler = jest.fn();
    const unsubscribe = webSocketService.subscribe('wf-1', handler);

    latestManager().emit({ type: 'system_stats' });

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('connects then delegates send to the manager', async () => {
    const message = { type: 'run_job', data: {} };
    await webSocketService.send(message, '/ws');

    expect(latestManager().sent).toEqual([message]);
  });

  it('tears down the old connection when switching paths', async () => {
    await webSocketService.ensureConnection('/ws');
    const first = latestManager();

    await webSocketService.ensureConnection('/other');

    expect(first.destroyed).toBe(true);
    expect(managerInstances()).toHaveLength(2);
    expect(latestManager().config.url).toBe('ws://test.local/other');
    expect(latestManager().config.headers).toEqual({ Authorization: 'Bearer tok-123' });
  });
});
