/**
 * Tests for WorkflowRunner — focuses on the handleMessage reducer.
 *
 * The reducer is internal, so we drive it through the public store: `run()`
 * calls `ensureConnection()`, which subscribes a handler to the
 * WebSocketService. We capture that handler and feed it messages directly,
 * exercising every branch of handleMessage.
 */

import {
  createWorkflowRunnerStore,
  getWorkflowRunnerStore,
  type WorkflowRunnerStore,
} from './WorkflowRunner';
import { webSocketService } from '../services/WebSocketService';
import { useAuthStore } from './AuthStore';
import type { Workflow } from '../types/workflow';

jest.mock('../services/WebSocketService', () => ({
  webSocketService: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/api', () => ({
  apiService: {
    getApiHost: jest.fn().mockReturnValue('http://localhost:7777'),
  },
}));

jest.mock('./AuthStore', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ session: null }),
  },
}));

const mockWs = webSocketService as jest.Mocked<typeof webSocketService>;

const WORKFLOW_ID = 'wf-1';

const makeWorkflow = (): Workflow =>
  ({
    id: WORKFLOW_ID,
    name: 'Test',
    graph: { nodes: [], edges: [] },
  } as unknown as Workflow);

/**
 * Boots a store through `run()` and returns the store plus the message handler
 * that `ensureConnection` registered with the WebSocketService.
 */
async function bootStore(): Promise<{
  store: WorkflowRunnerStore;
  handler: (message: Record<string, unknown>) => void;
}> {
  const store = createWorkflowRunnerStore(WORKFLOW_ID);
  let handler: ((message: Record<string, unknown>) => void) | undefined;
  mockWs.subscribe.mockImplementation((_key: string, h) => {
    handler = h as (message: Record<string, unknown>) => void;
    return () => {};
  });
  await store.getState().run({}, makeWorkflow());
  if (!handler) {
    throw new Error('handler was not registered');
  }
  return { store, handler };
}

describe('WorkflowRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore.getState as jest.Mock).mockReturnValue({ session: null });
    mockWs.subscribe.mockReturnValue(() => {});
  });

  describe('initial state', () => {
    it('has expected defaults', () => {
      const store = createWorkflowRunnerStore('init-test');
      const state = store.getState();
      expect(state.state).toBe('idle');
      expect(state.logs).toEqual([]);
      expect(state.results).toBeNull();
      expect(state.nodeProgress).toEqual({});
      expect(state.nodeStatus).toEqual({});
      expect(state.nodeResults).toEqual({});
      expect(state.nodeErrors).toEqual({});
      expect(state.job_id).toBeNull();
    });
  });

  describe('run', () => {
    it('connects, sets running state, and sends run_job', async () => {
      const { store } = await bootStore();
      expect(mockWs.ensureConnection).toHaveBeenCalledWith('/ws');
      expect(store.getState().state).toBe('running');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'run_job', command: 'run_job' }),
        '/ws'
      );
    });

    it('uses local fallbacks when there is no session', async () => {
      await bootStore();
      const sent = mockWs.send.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(sent.data.auth_token).toBe('local_token');
      expect(sent.data.user_id).toBe('1');
    });

    it('uses session token and user id when authenticated', async () => {
      (useAuthStore.getState as jest.Mock).mockReturnValue({
        session: { access_token: 'tok-123', user: { id: 'user-9' } },
      });
      await bootStore();
      const sent = mockWs.send.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(sent.data.auth_token).toBe('tok-123');
      expect(sent.data.user_id).toBe('user-9');
    });

    it('filters out bypassed nodes and their edges', async () => {
      const store = createWorkflowRunnerStore('bypass-test');
      mockWs.subscribe.mockImplementation(() => () => {});
      const workflow = {
        id: 'bypass-test',
        name: 'Bypass',
        graph: {
          nodes: [
            { id: 'a', data: {} },
            { id: 'b', data: { bypassed: true } },
            { id: 'c', data: {} },
          ],
          edges: [
            { source: 'a', target: 'b' },
            { source: 'a', target: 'c' },
          ],
        },
      } as unknown as Workflow;
      await store.getState().run({}, workflow);
      const sent = mockWs.send.mock.calls[0][0] as {
        data: { graph: { nodes: unknown[]; edges: unknown[] } };
      };
      const nodeIds = sent.data.graph.nodes.map((n) => (n as { id: string }).id);
      expect(nodeIds).toEqual(['a', 'c']);
      expect(sent.data.graph.edges).toHaveLength(1);
    });
  });

  describe('job_update', () => {
    it('handles completed → sets results and completed state', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'completed', result: { ok: 1 } });
      expect(store.getState().state).toBe('completed');
      expect(store.getState().results).toEqual({ ok: 1 });
      expect(store.getState().statusMessage).toBe('Completed');
    });

    it('handles failed → error state with error_message', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'failed', error_message: 'boom' });
      expect(store.getState().state).toBe('error');
      expect(store.getState().statusMessage).toBe('Failed: boom');
    });

    it('handles timed_out → error state', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'timed_out' });
      expect(store.getState().state).toBe('error');
      expect(store.getState().statusMessage).toContain('Failed:');
    });

    it('handles cancelled → cancelled state', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'cancelled' });
      expect(store.getState().state).toBe('cancelled');
      expect(store.getState().statusMessage).toBe('Cancelled');
    });

    it('handles running with a custom message', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'running', message: 'Working' });
      expect(store.getState().state).toBe('running');
      expect(store.getState().statusMessage).toBe('Working');
    });

    it('handles queued → running with booting message', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'queued' });
      expect(store.getState().state).toBe('running');
      expect(store.getState().statusMessage).toContain('booting');
    });

    it('handles suspended with a suspension_reason', async () => {
      const { store, handler } = await bootStore();
      handler({
        type: 'job_update',
        status: 'suspended',
        suspension_reason: 'needs input',
      });
      expect(store.getState().state).toBe('suspended');
      expect(store.getState().statusMessage).toBe('Suspended: needs input');
    });

    it('handles paused → paused state', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'paused' });
      expect(store.getState().state).toBe('paused');
      expect(store.getState().statusMessage).toBe('Paused');
    });

    it('does not overwrite error state with a stale running update', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'job_update', status: 'failed', error: 'x' });
      expect(store.getState().state).toBe('error');
      handler({ type: 'job_update', status: 'running' });
      expect(store.getState().state).toBe('error');
    });
  });

  describe('node_update', () => {
    it('tracks status and appends a log line', async () => {
      const { store, handler } = await bootStore();
      handler({
        type: 'node_update',
        node_id: 'n1',
        node_name: 'NodeOne',
        status: 'running',
      });
      const state = store.getState();
      expect(state.nodeStatus.n1).toBe('running');
      expect(state.statusMessage).toBe('NodeOne running');
      expect(state.logs).toContain('NodeOne: running');
    });

    it('stores per-node result', async () => {
      const { store, handler } = await bootStore();
      handler({
        type: 'node_update',
        node_id: 'n1',
        status: 'completed',
        result: { value: 42 },
      });
      expect(store.getState().nodeResults.n1).toEqual({ value: 42 });
    });

    it('records an error → error state and error log', async () => {
      const { store, handler } = await bootStore();
      handler({
        type: 'node_update',
        node_id: 'n1',
        node_name: 'NodeOne',
        status: 'error',
        error: 'kaboom',
      });
      const state = store.getState();
      expect(state.nodeErrors.n1).toBe('kaboom');
      expect(state.state).toBe('error');
      expect(state.logs.some((l) => l.includes('Error [NodeOne]: kaboom'))).toBe(true);
    });

    it('ignores updates after cancellation', async () => {
      const { store, handler } = await bootStore();
      store.setState({ state: 'cancelled' });
      handler({ type: 'node_update', node_id: 'n1', status: 'running' });
      expect(store.getState().nodeStatus.n1).toBeUndefined();
      expect(store.getState().state).toBe('cancelled');
    });
  });

  describe('node_progress', () => {
    it('records progress and total per node', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'node_progress', node_id: 'n1', progress: 3, total: 10 });
      expect(store.getState().nodeProgress.n1).toEqual({ progress: 3, total: 10 });
    });
  });

  describe('output_update', () => {
    it('stores a streamed output value', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'output_update', node_id: 'n1', value: 'hello' });
      expect(store.getState().nodeResults.n1).toBe('hello');
    });

    it('ignores updates with undefined value', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'output_update', node_id: 'n1' });
      expect(store.getState().nodeResults.n1).toBeUndefined();
    });
  });

  describe('log_update', () => {
    it('appends from message field', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'log_update', message: 'log line' });
      expect(store.getState().logs).toContain('log line');
    });

    it('appends from content field', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'log_update', content: 'content line' });
      expect(store.getState().logs).toContain('content line');
    });
  });

  describe('notification', () => {
    it('appends a prefixed notification log', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'notification', content: 'heads up' });
      expect(store.getState().logs).toContain('[notification] heads up');
    });
  });

  describe('prediction', () => {
    it('marks the node as booting', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'prediction', node_id: 'n1', node_name: 'NodeOne' });
      expect(store.getState().nodeStatus.n1).toBe('booting');
      expect(store.getState().statusMessage).toBe('NodeOne booting...');
    });
  });

  describe('default branch', () => {
    it('logs generic messages with a string message field', async () => {
      const { store, handler } = await bootStore();
      handler({ type: 'custom_event', message: 'something' });
      expect(store.getState().logs).toContain('[custom_event] something');
    });
  });

  describe('appendLog MAX_LOGS cap', () => {
    it('trims logs to the last 500 entries', async () => {
      const { store, handler } = await bootStore();
      for (let i = 0; i < 520; i++) {
        handler({ type: 'log_update', message: `line-${i}` });
      }
      const logs = store.getState().logs;
      expect(logs).toHaveLength(500);
      expect(logs[0]).toBe('line-20');
      expect(logs[logs.length - 1]).toBe('line-519');
    });
  });

  describe('job_id tracking', () => {
    it('subscribes to the job_id from the first message that carries one', async () => {
      const store = createWorkflowRunnerStore(WORKFLOW_ID);
      let wfHandler: ((m: Record<string, unknown>) => void) | undefined;
      mockWs.subscribe.mockImplementation((key: string, h) => {
        if (key === WORKFLOW_ID) {
          wfHandler = h as (m: Record<string, unknown>) => void;
        }
        return () => {};
      });
      await store.getState().run({}, makeWorkflow());
      mockWs.subscribe.mockClear();

      wfHandler!({ type: 'job_update', status: 'running', job_id: 'job-42' });
      expect(store.getState().job_id).toBe('job-42');
      expect(mockWs.subscribe).toHaveBeenCalledWith('job-42', expect.any(Function));
    });
  });

  describe('cancel / resume', () => {
    it('cancel sets cancelled state and sends cancel_job when a job exists', async () => {
      const { store } = await bootStore();
      store.setState({ job_id: 'job-1' });
      mockWs.send.mockClear();
      await store.getState().cancel();
      expect(store.getState().state).toBe('cancelled');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cancel_job' }),
        '/ws'
      );
    });

    it('resume sends resume_job and returns to running', async () => {
      const { store } = await bootStore();
      store.setState({ job_id: 'job-1' });
      mockWs.send.mockClear();
      await store.getState().resume();
      expect(store.getState().state).toBe('running');
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'resume_job' }),
        '/ws'
      );
    });
  });

  describe('setStatusMessage', () => {
    it('updates the status message', () => {
      const store = createWorkflowRunnerStore('status-test');
      store.getState().setStatusMessage('hi');
      expect(store.getState().statusMessage).toBe('hi');
    });
  });

  describe('getWorkflowRunnerStore', () => {
    it('returns the same store instance for a given workflow id', () => {
      const a = getWorkflowRunnerStore('shared-id');
      const b = getWorkflowRunnerStore('shared-id');
      expect(a).toBe(b);
    });

    it('cleanup removes the store from the registry', () => {
      const a = getWorkflowRunnerStore('cleanup-id');
      a.getState().cleanup();
      const b = getWorkflowRunnerStore('cleanup-id');
      expect(a).not.toBe(b);
    });
  });
});
