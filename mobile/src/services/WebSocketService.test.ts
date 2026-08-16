/**
 * Tests for the WebSocketService router that wraps WebSocketManager.
 * WebSocketManager is mocked so we can assert delegation + routing in isolation.
 */

interface MockManagerShape {
  config: { url: string; headers?: Record<string, string> };
  callbacks: Record<string, ((...args: unknown[]) => void) | undefined>;
  connected: boolean;
  state: string;
  sent: unknown[];
  destroyed: boolean;
  resumeCalls: number;
  pauseCalls: number;
  setCallbacks: (cb: Record<string, (...args: unknown[]) => void>) => void;
  isConnected: () => boolean;
  getState: () => string;
  connect: () => Promise<void>;
  send: (msg: unknown) => void;
  destroy: () => void;
  resumeFromBackground: () => void;
  pauseForBackground: () => void;
  emit: (data: Record<string, unknown>) => void;
  drop: () => void;
  reopen: () => void;
}

/** Every manager the service constructed, newest last. */
const mockManagerInstances: MockManagerShape[] = [];

jest.mock('./WebSocketManager', () => {
  class MockWebSocketManager {
    config: { url: string; headers?: Record<string, string> };
    callbacks: Record<string, ((...args: unknown[]) => void) | undefined> = {};
    connected = false;
    state = 'disconnected';
    sent: unknown[] = [];
    destroyed = false;
    resumeCalls = 0;
    pauseCalls = 0;
    constructor(config: { url: string; headers?: Record<string, string> }) {
      this.config = config;
      mockManagerInstances.push(this);
    }
    setCallbacks(cb: Record<string, (...args: unknown[]) => void>) {
      this.callbacks = { ...this.callbacks, ...cb };
    }
    isConnected() {
      return this.connected;
    }
    getState() {
      return this.state;
    }
    async connect() {
      this.reopen();
    }
    send(msg: unknown) {
      this.sent.push(msg);
    }
    destroy() {
      this.destroyed = true;
      this.connected = false;
      this.state = 'disconnected';
    }
    resumeFromBackground() {
      this.resumeCalls++;
    }
    pauseForBackground() {
      this.pauseCalls++;
    }
    emit(data: Record<string, unknown>) {
      this.callbacks.onMessage?.(data);
    }
    /** Simulate the socket dying (e.g. iOS suspending it). */
    drop() {
      this.connected = false;
      this.state = 'disconnected';
      this.callbacks.onClose?.(1006, 'suspended');
    }
    /** Simulate the transport (re)opening the socket. */
    reopen() {
      this.connected = true;
      this.state = 'connected';
      this.callbacks.onOpen?.();
    }
  }
  return { WebSocketManager: MockWebSocketManager };
});

// Controllable stand-in for the AppState-backed lifecycle module. The service
// subscribes lazily (on the first connection), so this is only touched from
// inside tests — after the const below is initialized.
const mockLifecycle = {
  listeners: new Set<(event: 'foreground' | 'background') => void>(),
  emit(event: 'foreground' | 'background') {
    mockLifecycle.listeners.forEach((listener) => listener(event));
  },
};

jest.mock('../hooks/useAppLifecycle', () => ({
  isAppForeground: () => true,
  subscribeAppLifecycle: (listener: (event: 'foreground' | 'background') => void) => {
    mockLifecycle.listeners.add(listener);
    return () => mockLifecycle.listeners.delete(listener);
  },
}));

jest.mock('./api', () => ({
  apiService: { getWebSocketUrl: (path: string) => `ws://test.local${path}` },
}));

jest.mock('../stores/AuthStore', () => ({
  useAuthStore: { getState: () => ({ session: { access_token: 'tok-123' } }) },
}));

import { webSocketService } from './WebSocketService';

function managerInstances(): MockManagerShape[] {
  return mockManagerInstances;
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

  describe('app lifecycle', () => {
    it('asks the transport to reconnect when the app is foregrounded', async () => {
      await webSocketService.ensureConnection('/ws');
      latestManager().drop();

      mockLifecycle.emit('foreground');

      expect(latestManager().resumeCalls).toBe(1);
    });

    it('pauses the transport reconnect timer when the app is backgrounded', async () => {
      await webSocketService.ensureConnection('/ws');

      mockLifecycle.emit('background');

      expect(latestManager().pauseCalls).toBe(1);
    });

    it('does nothing on foreground when there is no connection to resume', () => {
      mockLifecycle.emit('foreground');
      mockLifecycle.emit('background');

      expect(managerInstances()).toHaveLength(0);
    });

    it('keeps delivering messages to existing subscribers after a reconnect', async () => {
      await webSocketService.ensureConnection('/ws');
      const received: Record<string, unknown>[] = [];
      const unsubscribe = webSocketService.subscribe('wf-1', (m) => received.push(m));

      const manager = latestManager();
      manager.drop();
      mockLifecycle.emit('foreground');
      manager.reopen();

      manager.emit({ type: 'node_update', workflow_id: 'wf-1', status: 'running' });

      expect(received).toHaveLength(1);
      unsubscribe();
    });

    it('re-attaches running jobs server-side after a reconnect', async () => {
      await webSocketService.ensureConnection('/ws');
      const manager = latestManager();
      const unsubscribe = webSocketService.subscribe('wf-1', jest.fn());

      manager.emit({
        type: 'job_update',
        status: 'running',
        job_id: 'job-1',
        workflow_id: 'wf-1',
      });

      manager.drop();
      mockLifecycle.emit('foreground');
      manager.reopen();

      expect(manager.sent).toEqual([
        {
          type: 'reconnect_job',
          command: 'reconnect_job',
          data: { job_id: 'job-1', workflow_id: 'wf-1' },
        },
      ]);
      unsubscribe();
    });

    it('does not re-attach jobs that already finished', async () => {
      await webSocketService.ensureConnection('/ws');
      const manager = latestManager();

      manager.emit({ type: 'job_update', status: 'running', job_id: 'job-1', workflow_id: 'wf-1' });
      manager.emit({ type: 'job_update', status: 'completed', job_id: 'job-1', workflow_id: 'wf-1' });

      manager.drop();
      manager.reopen();

      expect(manager.sent).toEqual([]);
    });

    it('sends no reconnect_job on the first connection', async () => {
      await webSocketService.ensureConnection('/ws');

      expect(latestManager().sent).toEqual([]);
    });

    it('reuses an in-flight reconnect instead of replacing the transport', async () => {
      await webSocketService.ensureConnection('/ws');
      const manager = latestManager();
      manager.connected = false;
      manager.state = 'reconnecting';

      await webSocketService.ensureConnection('/ws');

      expect(managerInstances()).toHaveLength(1);
      expect(manager.destroyed).toBe(false);
    });

    it('replaces a dead transport when a caller needs a connection', async () => {
      await webSocketService.ensureConnection('/ws');
      const first = latestManager();
      first.connected = false;
      first.state = 'failed';

      await webSocketService.ensureConnection('/ws');

      expect(managerInstances()).toHaveLength(2);
      expect(first.destroyed).toBe(true);
    });
  });

  describe('inbound protocol validation (B4)', () => {
    beforeEach(() => {
      jest.mocked(console.error).mockClear();
    });

    it('does not log for a valid message and still dispatches it', async () => {
      await webSocketService.ensureConnection('/ws');
      const handler = jest.fn();
      const unsubscribe = webSocketService.subscribe('job-valid', handler);

      const validMessage = {
        type: 'node_update',
        node_id: 'n1',
        node_name: 'My Node',
        node_type: 'nodetool.text.Concat',
        status: 'completed',
        job_id: 'job-valid',
      };

      latestManager().emit(validMessage);

      expect(handler).toHaveBeenCalledWith(validMessage);
      expect(console.error).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('logs a structured error for an invalid message but still dispatches it', async () => {
      await webSocketService.ensureConnection('/ws');
      const handler = jest.fn();
      const unsubscribe = webSocketService.subscribe('job-invalid', handler);

      // Missing required fields (node_name, node_type, status) for node_update.
      const invalidMessage = {
        type: 'node_update',
        node_id: 'n1',
        job_id: 'job-invalid',
      };

      latestManager().emit(invalidMessage);

      // Observe-only: the message is still routed to subscribers.
      expect(handler).toHaveBeenCalledWith(invalidMessage);
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(jest.mocked(console.error).mock.calls[0][0]).toContain('node_update');
      unsubscribe();
    });

    it('skips validation for message types outside the protocol union', async () => {
      await webSocketService.ensureConnection('/ws');

      latestManager().emit({ type: 'some_unrelated_frame', anything: 'goes' });

      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
