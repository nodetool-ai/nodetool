import { decode } from '@msgpack/msgpack';
import { EventEmitter } from 'events';
import * as zustandVanilla from 'zustand/vanilla';

// Use the vanilla version of zustand to avoid React dependency in tests
jest.mock('zustand', () => ({ ...zustandVanilla, create: zustandVanilla.createStore }));

import { createWorkflowRunner } from '../WorkflowRunner';

// Mock electron Notification API
jest.mock('electron', () => {
  return {
    Notification: jest.fn().mockImplementation(() => ({
      show: jest.fn(),
    })),
  };
});

// Mock WebSocket module with a simple EventEmitter based implementation
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

const { Notification } = jest.requireMock('electron');
const { instances: wsInstances } = jest.requireMock('ws');

describe('WorkflowRunner', () => {
  beforeEach(() => {
    // reset mocks and instances before each test
    jest.clearAllMocks();
    wsInstances.length = 0;
  });

  it('connect resolves when websocket opens', async () => {
    const runner = createWorkflowRunner();
    const connectPromise = runner.getState().connect();

    expect(runner.getState().state).toBe('connecting');
    const socket = wsInstances[0];
    expect(socket).toBeDefined();

    socket.emit('open');
    await connectPromise;

    expect(runner.getState().state).toBe('connected');
    expect(runner.getState().socket).toBe(socket);
  });

  it('run sends encoded job request and notifies', async () => {
    const runner = createWorkflowRunner();
    const workflow = { id: '123', name: 'Test' } as any;

    const runPromise = runner.getState().run(workflow, { foo: 'bar' });
    const socket = wsInstances[0];
    socket.emit('open');
    await runPromise;

    expect(runner.getState().state).toBe('running');
    expect(socket.send).toHaveBeenCalledTimes(1);

    const encoded = socket.send.mock.calls[0][0];
    const decoded: any = decode(encoded);
    expect(decoded.command).toBe('run_job');
    expect(decoded.data.workflow_id).toBe('123');

    expect(Notification).toHaveBeenCalledWith({
      title: 'Nodetool',
      body: 'Running Test',
      silent: false,
      urgency: 'normal',
    });
    expect(Notification.mock.results[0].value.show).toHaveBeenCalled();
  });

  it('addNotification stores notification and shows system notification', () => {
    const runner = createWorkflowRunner();
    runner.getState().addNotification({ type: 'info', content: 'hello' });

    const notes = runner.getState().notifications;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'info', content: 'hello' });

    expect(Notification).toHaveBeenCalledWith({
      title: 'Nodetool',
      body: 'hello',
      silent: false,
      urgency: 'normal',
    });
    expect(Notification.mock.results[0].value.show).toHaveBeenCalled();
  });

  it('disconnect closes the socket and resets state', async () => {
    const runner = createWorkflowRunner();
    const connectPromise = runner.getState().connect();
    const socket = wsInstances[0];
    socket.emit('open');
    await connectPromise;

    runner.getState().disconnect();

    expect(socket.close).toHaveBeenCalled();
    expect(runner.getState().socket).toBeNull();
    expect(runner.getState().state).toBe('idle');
  });
});
