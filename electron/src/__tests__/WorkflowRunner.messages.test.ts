import { encode } from '@msgpack/msgpack';
import { EventEmitter } from 'events';
import * as zustandVanilla from 'zustand/vanilla';

jest.mock('zustand', () => ({ ...zustandVanilla, create: zustandVanilla.createStore }));
jest.mock('electron', () => ({
  Notification: jest.fn().mockImplementation(() => ({ show: jest.fn() })),
}));

jest.mock('ws', () => {
  const instances: any[] = [];
  class WS extends EventEmitter {
    public url: string;
    public send = jest.fn();
    public close = jest.fn();
    constructor(url: string) {
      super();
      this.url = url;
      instances.push(this);
    }
  }
  return { __esModule: true, default: WS, instances };
});

import { createWorkflowRunner } from '../WorkflowRunner';

const { instances: wsInstances } = jest.requireMock('ws');

async function connectRunner() {
  const runner = createWorkflowRunner();
  const connectPromise = runner.getState().connect();
  const socket = wsInstances[wsInstances.length - 1];
  socket.emit('open');
  await connectPromise;
  return { runner, socket };
}

function sendMessage(socket: any, data: Record<string, unknown>) {
  socket.emit('message', Buffer.from(encode(data)));
}

describe('WorkflowRunner message handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wsInstances.length = 0;
  });

  describe('job_update', () => {
    it('sets state to running and statusMessage when status is running', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'job_update', status: 'running' });

      expect(runner.getState().state).toBe('running');
      expect(runner.getState().statusMessage).toBe('Job running');
    });

    it('sets jobId when job_id is present', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'job_update', status: 'running', job_id: 'abc-123' });

      expect(runner.getState().jobId).toBe('abc-123');
    });

    it('calls onComplete with results and disconnects on completed', async () => {
      const { runner, socket } = await connectRunner();
      const onComplete = jest.fn();
      runner.setState({ onComplete, workflow: { id: '1', name: 'Test' } as any });

      sendMessage(socket, { type: 'job_update', status: 'completed' });

      expect(onComplete).toHaveBeenCalledWith([]);
      expect(socket.close).toHaveBeenCalled();
      expect(runner.getState().socket).toBeNull();
    });

    it('sets error and adds notification on failed', async () => {
      const { runner, socket } = await connectRunner();
      runner.setState({ workflow: { id: '1', name: 'MyWf' } as any });

      sendMessage(socket, { type: 'job_update', status: 'failed', error: 'something broke' });

      expect(runner.getState().error).toBeInstanceOf(Error);
      expect(runner.getState().error?.message).toBe('something broke');
      const errorNotification = runner.getState().notifications.find(n => n.type === 'error');
      expect(errorNotification).toBeDefined();
      expect(errorNotification?.content).toContain('something broke');
      expect(socket.close).toHaveBeenCalled();
    });
  });

  describe('node_progress', () => {
    it('sets progress current and total', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'node_progress', progress: 5, total: 10 });

      expect(runner.getState().progress).toEqual({ current: 5, total: 10 });
    });
  });

  describe('chunk', () => {
    it('appends content to chunks array', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'chunk', content: 'hello' });
      sendMessage(socket, { type: 'chunk', content: ' world' });

      expect(runner.getState().chunks).toEqual(['hello', ' world']);
    });

    it('does not modify chunks when content is undefined', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'chunk' });

      expect(runner.getState().chunks).toEqual([]);
    });
  });

  describe('node_update', () => {
    it('sets state to error and adds notification when error is present', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'node_update', error: 'node failed' });

      expect(runner.getState().state).toBe('error');
      const errorNotification = runner.getState().notifications.find(n => n.type === 'error');
      expect(errorNotification).toBeDefined();
      expect(errorNotification?.content).toBe('node failed');
    });

    it('adds to results when result.output exists and node_name includes Output', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, {
        type: 'node_update',
        node_name: 'TextOutput',
        result: { output: 'my result' },
      });

      expect(runner.getState().results).toEqual(['my result']);
    });

    it('sets statusMessage when node_name is present but no error or output', async () => {
      const { runner, socket } = await connectRunner();

      sendMessage(socket, { type: 'node_update', node_name: 'ImageResize', status: 'processing' });

      expect(runner.getState().statusMessage).toBe('ImageResize processing');
    });
  });
});
