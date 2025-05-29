import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;
(global as any).URL.createObjectURL = jest.fn(() => 'blob:mock');

import { encode } from '@msgpack/msgpack';
import useGlobalChatStore from '../GlobalChatStore';
import { Message } from '../ApiTypes';

jest.mock('../ApiClient', () => ({ CHAT_URL: 'ws://test/chat', isLocalhost: true }));
jest.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) } }
}));
jest.mock('loglevel', () => ({
  __esModule: true,
  default: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let uuidCounter = 0;
jest.mock('../uuidv4', () => ({ uuidv4: () => `id-${uuidCounter++}` }));

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

describe('GlobalChatStore', () => {
  const store = useGlobalChatStore;
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
    uuidCounter = 0;
    store.setState({
      ...defaultState,
      socket: null,
      threads: {},
      currentThreadId: null,
      status: 'disconnected',
      error: null,
      progress: { current: 0, total: 0 },
    });
  });

  it('createNewThread creates thread and sets currentThreadId', () => {
    const id = store.getState().createNewThread();
    expect(id).toBe('id-0');
    const state = store.getState();
    expect(state.currentThreadId).toBe(id);
    expect(state.threads[id]).toBeDefined();
  });

  it('sendMessage adds message to thread and sends via socket', async () => {
    const socket = new MockWebSocket('ws://test/chat');
    store.setState({ socket: socket as unknown as WebSocket });
    const msg: Message = { role: 'user', type: 'message', content: 'hello' } as Message;
    await store.getState().sendMessage(msg);
    const threadId = store.getState().currentThreadId as string;
    expect(store.getState().threads[threadId].messages[0]).toEqual(msg);
    expect(store.getState().status).toBe('loading');
    expect(socket.send).toHaveBeenCalledWith(encode({ ...msg, thread_id: threadId }));
  });

  it('switchThread does nothing for invalid id', () => {
    store.getState().createNewThread();
    store.getState().switchThread('nonexistent');
    expect(store.getState().currentThreadId).toBe('id-0');
  });

  it('deleteThread removes thread and creates new if none left', () => {
    const first = store.getState().createNewThread();
    store.getState().deleteThread(first);
    const state = store.getState();
    expect(state.currentThreadId).toBe('id-1');
    expect(Object.keys(state.threads)).toEqual(['id-1']);
  });
});
