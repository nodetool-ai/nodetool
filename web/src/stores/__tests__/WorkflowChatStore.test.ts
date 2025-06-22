import { TextEncoder, TextDecoder } from 'util';
// Polyfill TextEncoder/Decoder for msgpack
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;
(global as any).URL.createObjectURL = jest.fn(() => 'blob:mock');

import { encode } from '@msgpack/msgpack';
import useWorkflowChatStore from '../WorkflowChatStore';
import { Message, WorkflowAttributes, OutputUpdate } from '../ApiTypes';

jest.mock('../workflowUpdates', () => ({ handleUpdate: jest.fn() }));
jest.mock('../ApiClient', () => ({ CHAT_URL: 'ws://test/chat', isLocalhost: true }));
jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));
jest.mock('loglevel', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  send = jest.fn();
  close = jest.fn();
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => any) | null = null;
  onerror: ((event: any) => any) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {}
}

describe('WorkflowChatStore', () => {
  const store = useWorkflowChatStore;
  const defaultState = { ...store.getState() };
  const OriginalWebSocket = global.WebSocket;

  beforeAll(() => {
    (global as any).WebSocket = MockWebSocket as any;
  });

  afterAll(() => {
    (global as any).WebSocket = OriginalWebSocket;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    store.setState({
      ...defaultState,
      socket: null,
      workflow: null,
      messages: [],
      progressMessage: null,
      progress: 0,
      total: 0,
      status: 'disconnected',
      error: null,
    } as any);
  });

  it('sendMessage sends message when socket is open', async () => {
    const socket = new MockWebSocket('ws://test/chat');
    const wsManager = {
      isConnected: () => true,
      send: jest.fn()
    } as any;
    store.setState({ wsManager, socket: socket as unknown as WebSocket } as any);

    const message: Message = {
      role: 'user',
      type: 'message',
      content: 'Hello',
      workflow_id: '1',
    } as unknown as Message;

    await store.getState().sendMessage(message);

    expect(wsManager.send).toHaveBeenCalledWith(message);
    expect(store.getState().messages).toEqual([message]);
    expect(store.getState().status).toBe('loading');
  });

  it('sendMessage does nothing when socket is not open', async () => {
    const socket = new MockWebSocket('ws://test/chat');
    socket.readyState = 0;
    const wsManager = {
      isConnected: () => false,
      send: jest.fn()
    } as any;
    store.setState({ wsManager, socket: socket as unknown as WebSocket } as any);

    const message: Message = {
      role: 'user',
      type: 'message',
      content: 'Hi',
      workflow_id: '1',
    } as unknown as Message;

    await store.getState().sendMessage(message);

    expect(wsManager.send).not.toHaveBeenCalled();
    expect(store.getState().messages).toHaveLength(0);
  });

  it('resetMessages clears messages array', () => {
    store.setState({ messages: [{ type: 'message', role: 'assistant', content: 'x' }] as any });
    store.getState().resetMessages();
    expect(store.getState().messages).toEqual([]);
  });

  it('handles string output_update messages', async () => {
    await store.getState().connect({ id: 'wf1' } as WorkflowAttributes);
    const socket = (store.getState() as any).socket as unknown as MockWebSocket;
    socket.onopen?.();

    const sendUpdate = async (value: string) => {
      const update: OutputUpdate = {
        type: 'output_update',
        output_type: 'string',
        value,
        node_id: 'node1',
      } as unknown as OutputUpdate;
      const encoded = encode(update);
      const buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteLength + encoded.byteOffset);
      await socket.onmessage?.({
        data: { arrayBuffer: () => Promise.resolve(buf) },
      } as any);
    };

    await sendUpdate('Hello');
    expect(store.getState().messages[0].content).toBe('Hello');

    await sendUpdate(' world');
    expect(store.getState().messages[0].content).toBe('Hello world');

    await sendUpdate('<nodetool_end_of_stream>');
    expect(store.getState().messages[0].content).toBe('Hello world');
  });

  it('handles image output_update messages', async () => {
    await store.getState().connect({ id: 'wf1' } as WorkflowAttributes);
    const socket = (store.getState() as any).socket as unknown as MockWebSocket;
    socket.onopen?.();
    const img = new Uint8Array([1, 2, 3]);
    const update: OutputUpdate = {
      type: 'output_update',
      output_type: 'image',
      value: { data: img },
      node_id: 'node1',
    } as unknown as OutputUpdate;
    const encoded = encode(update);
    const buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteLength + encoded.byteOffset);
    await socket.onmessage?.({
      data: { arrayBuffer: () => Promise.resolve(buf) },
    } as any);
    const message = store.getState().messages[0];
    expect(Array.isArray(message.content)).toBe(true);
    const content = (message.content as any[])[0];
    expect(content.type).toBe('image_url');
    expect(content.image.uri).toContain('blob:');
  });
});
