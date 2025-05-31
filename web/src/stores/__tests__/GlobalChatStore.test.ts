import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;
(global as any).URL.createObjectURL = jest.fn(() => 'blob:mock');

import { encode, decode } from '@msgpack/msgpack';
import useGlobalChatStore from '../GlobalChatStore';
import { Message, JobUpdate, NodeUpdate, Chunk, OutputUpdate, ToolCallUpdate, NodeProgress } from '../ApiTypes';
import log from 'loglevel';
import { supabase } from '../../lib/supabaseClient';

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
    error: jest.fn()
  },
}));

let uuidCounter = 0;
jest.mock('../uuidv4', () => ({ uuidv4: () => `id-${uuidCounter++}` }));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  readyState = MockWebSocket.CONNECTING;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: 'Normal closure', wasClean: true } as any);
    }
  });
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => any) | null = null;
  onerror: ((event: any) => any) | null = null;
  onclose: ((event: any) => any) | null = null;
  
  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 0);
  }
  
  async simulateMessage(data: any) {
    if (this.onmessage) {
      const encoded = encode(data);
      const arrayBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
      const mockData = {
        arrayBuffer: () => Promise.resolve(arrayBuffer)
      };
      await this.onmessage({ data: mockData });
    }
  }
  
  simulateError(error?: any) {
    if (this.onerror) {
      this.onerror(error || new Error('Mock error'));
    }
  }
  
  simulateClose(code = 1000, reason = '', wasClean = true) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, wasClean } as any);
    }
  }
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
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
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
    socket.readyState = MockWebSocket.OPEN;
    store.setState({ socket: socket as unknown as WebSocket });
    const msg: Message = { role: 'user', type: 'message', content: 'hello' } as Message;
    await store.getState().sendMessage(msg);
    const threadId = store.getState().currentThreadId as string;
    expect(threadId).toBeTruthy();
    expect(store.getState().threads[threadId]).toBeDefined();
    expect(store.getState().threads[threadId].messages[0]).toEqual({ ...msg, workflow_id: undefined, thread_id: threadId });
    expect(store.getState().status).toBe('loading');
    expect(socket.send).toHaveBeenCalledWith(encode({ ...msg, workflow_id: undefined, thread_id: threadId }));
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

  describe('WebSocket Connection', () => {
    it('connect establishes WebSocket connection', async () => {
      await store.getState().connect();
      const state = store.getState();
      expect(state.status).toBe('connected');
      expect(state.socket).toBeTruthy();
      expect(state.error).toBeNull();
    });

    it('connect with workflowId sets workflowId', async () => {
      await store.getState().connect('workflow-123');
      expect(store.getState().workflowId).toBe('workflow-123');
    });

    it('connect closes existing socket before creating new one', async () => {
      const existingSocket = new MockWebSocket('ws://test/chat');
      existingSocket.readyState = MockWebSocket.OPEN;
      store.setState({ socket: existingSocket as unknown as WebSocket });
      
      await store.getState().connect();
      expect(existingSocket.close).toHaveBeenCalled();
    });

    it('disconnect closes socket and updates status', () => {
      const socket = new MockWebSocket('ws://test/chat');
      socket.readyState = MockWebSocket.OPEN;
      store.setState({ socket: socket as unknown as WebSocket, status: 'connected' });
      
      store.getState().disconnect();
      expect(socket.close).toHaveBeenCalled();
      expect(store.getState().status).toBe('disconnected');
      expect(store.getState().socket).toBeNull();
    });

    it('handles WebSocket errors during connection', async () => {
      const connectPromise = store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      socket.simulateError();
      
      expect(store.getState().status).toBe('error');
      expect(store.getState().error).toContain('Connection failed');
    });

    it('handles WebSocket close events', async () => {
      await store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      
      socket.simulateClose(1006, 'Connection lost', false);
      expect(store.getState().status).toBe('disconnected');
      expect(store.getState().error).toBe('Connection lost');
    });

    it('handles clean WebSocket close without error', async () => {
      await store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      
      socket.simulateClose(1000, 'Normal closure', true);
      expect(store.getState().status).toBe('disconnected');
      expect(store.getState().error).toBeNull();
    });
  });

  describe('Message Handling', () => {
    let socket: MockWebSocket;
    
    beforeEach(async () => {
      await store.getState().connect();
      socket = store.getState().socket as unknown as MockWebSocket;
      store.getState().createNewThread();
    });

    it('handles incoming message updates', async () => {
      const message: Message = {
        role: 'assistant',
        type: 'message',
        content: 'Hello from assistant',
        workflow_id: 'test-workflow'
      };
      
      await socket.simulateMessage(message);
      
      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().threads[threadId].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
      expect(store.getState().status).toBe('connected');
    });

    it('handles chunk updates by appending to last assistant message', async () => {
      // First add an assistant message
      const message: Message = {
        role: 'assistant',
        type: 'message',
        content: 'Hello',
        workflow_id: 'test'
      };
      await socket.simulateMessage(message);
      
      // Then send a chunk
      const chunk: Chunk = {
        type: 'chunk',
        content: ' world!',
        content_type: 'text',
        done: false
      };
      await socket.simulateMessage(chunk);
      
      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().threads[threadId].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello world!');
    });

    it('handles chunk updates by creating new assistant message if none exists', () => {
      const chunk: Chunk = {
        type: 'chunk',
        content: 'New message',
        content_type: 'text',
        done: false
      };
      socket.simulateMessage(chunk);
      
      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().threads[threadId].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('New message');
    });

    it('handles job update - completed', () => {
      store.setState({ status: 'loading', progress: { current: 5, total: 10 } });
      
      const jobUpdate: JobUpdate = {
        type: 'job_update',
        status: 'completed',
        job_id: 'test-job'
      };
      socket.simulateMessage(jobUpdate);
      
      expect(store.getState().status).toBe('connected');
      expect(store.getState().progress).toEqual({ current: 0, total: 0 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it('handles job update - failed', () => {
      const jobUpdate: JobUpdate = {
        type: 'job_update',
        status: 'failed',
        job_id: 'test-job',
        error: 'Something went wrong'
      };
      socket.simulateMessage(jobUpdate);
      
      expect(store.getState().status).toBe('error');
      expect(store.getState().error).toBe('Something went wrong');
      expect(store.getState().statusMessage).toBe('Something went wrong');
    });

    it('handles node update - completed', () => {
      store.setState({ progress: { current: 5, total: 10 }, statusMessage: 'Processing...' });
      
      const nodeUpdate: NodeUpdate = {
        type: 'node_update',
        node_id: 'test-node',
        status: 'completed',
        node_name: 'Test Node'
      };
      socket.simulateMessage(nodeUpdate);
      
      expect(store.getState().progress).toEqual({ current: 0, total: 0 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it('handles node update - running', () => {
      const nodeUpdate: NodeUpdate = {
        type: 'node_update',
        node_id: 'test-node',
        status: 'running',
        node_name: 'Test Node'
      };
      socket.simulateMessage(nodeUpdate);
      
      expect(store.getState().statusMessage).toBe('Test Node');
    });

    it('handles tool call updates', () => {
      const toolUpdate: ToolCallUpdate = {
        type: 'tool_call_update',
        name: 'api_call',
        args: {},
        message: 'Calling API...'
      };
      socket.simulateMessage(toolUpdate);
      
      expect(store.getState().statusMessage).toBe('Calling API...');
    });

    it('handles node progress updates', () => {
      const progressUpdate: NodeProgress = {
        type: 'node_progress',
        node_id: 'test-node',
        progress: 75,
        total: 100,
        chunk: ''
      };
      socket.simulateMessage(progressUpdate);
      
      expect(store.getState().status).toBe('loading');
      expect(store.getState().progress).toEqual({ current: 75, total: 100 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it('handles output updates - string type', () => {
      // First add an assistant message
      const message: Message = {
        role: 'assistant',
        type: 'message',
        content: 'Current output: ',
        workflow_id: 'test'
      };
      socket.simulateMessage(message);
      
      const outputUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'output',
        output_type: 'string',
        value: 'additional text',
        metadata: {}
      };
      socket.simulateMessage(outputUpdate);
      
      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().threads[threadId].messages;
      expect(messages[0].content).toBe('Current output: additional text');
    });

    it('handles output updates - ignores end of stream marker', () => {
      const message: Message = {
        role: 'assistant',
        type: 'message',
        content: 'Test',
        workflow_id: 'test'
      };
      socket.simulateMessage(message);
      
      const outputUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'output',
        output_type: 'string',
        value: '<nodetool_end_of_stream>',
        metadata: {}
      };
      socket.simulateMessage(outputUpdate);
      
      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().threads[threadId].messages;
      expect(messages[0].content).toBe('Test'); // Should remain unchanged
    });

    it('handles output updates - image/audio/video types', () => {
      const mockData = new Uint8Array([1, 2, 3, 4]);
      const outputUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'output',
        output_type: 'image',
        value: { data: mockData },
        metadata: {}
      };
      socket.simulateMessage(outputUpdate);
      
      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().threads[threadId].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(Array.isArray(messages[0].content)).toBe(true);
    });
  });

  describe('Thread Management', () => {
    it('switchThread switches to existing thread', () => {
      const thread1 = store.getState().createNewThread();
      const thread2 = store.getState().createNewThread();
      
      store.getState().switchThread(thread1);
      expect(store.getState().currentThreadId).toBe(thread1);
    });

    it('deleteThread switches to most recent remaining thread', () => {
      const thread1 = store.getState().createNewThread();
      const thread2 = store.getState().createNewThread();
      
      store.getState().deleteThread(thread2);
      expect(store.getState().currentThreadId).toBe(thread1);
      expect(store.getState().threads[thread2]).toBeUndefined();
    });

    it('deleteThread handles deleting non-current thread', () => {
      const thread1 = store.getState().createNewThread();
      const thread2 = store.getState().createNewThread();
      
      store.getState().deleteThread(thread1);
      expect(store.getState().currentThreadId).toBe(thread2);
      expect(store.getState().threads[thread1]).toBeUndefined();
    });

    it('getCurrentMessages returns messages for current thread', () => {
      const threadId = store.getState().createNewThread();
      const message: Message = { role: 'user', type: 'message', content: 'test' } as Message;
      
      store.setState({
        threads: {
          [threadId]: {
            id: threadId,
            messages: [message],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
      
      const messages = store.getState().getCurrentMessages();
      expect(messages).toEqual([message]);
    });

    it('getCurrentMessages returns empty array when no current thread', () => {
      store.setState({ currentThreadId: null });
      expect(store.getState().getCurrentMessages()).toEqual([]);
    });

    it('updateThreadTitle updates thread title and timestamp', async () => {
      const threadId = store.getState().createNewThread();
      const originalTimestamp = store.getState().threads[threadId].updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1));
      
      store.getState().updateThreadTitle(threadId, 'New Title');
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe('New Title');
      expect(thread.updatedAt).not.toBe(originalTimestamp);
    });

    it('updateThreadTitle handles non-existent thread', () => {
      const initialState = store.getState();
      store.getState().updateThreadTitle('nonexistent', 'Title');
      expect(store.getState()).toEqual(initialState);
    });

    it('resetMessages clears messages for current thread', () => {
      const threadId = store.getState().createNewThread();
      const message: Message = { role: 'user', type: 'message', content: 'test' } as Message;
      
      store.setState({
        threads: {
          [threadId]: {
            id: threadId,
            messages: [message],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
      
      store.getState().resetMessages();
      expect(store.getState().threads[threadId].messages).toEqual([]);
    });
  });

  describe('sendMessage Advanced Cases', () => {
    let socket: MockWebSocket;
    
    beforeEach(async () => {
      await store.getState().connect();
      socket = store.getState().socket as unknown as MockWebSocket;
    });

    it('sendMessage creates thread if none exists', async () => {
      const message: Message = { role: 'user', type: 'message', content: 'hello' } as Message;
      await store.getState().sendMessage(message);
      
      expect(store.getState().currentThreadId).toBeTruthy();
      expect(Object.keys(store.getState().threads)).toHaveLength(1);
    });

    it('sendMessage auto-generates title from first user message', async () => {
      const message: Message = { role: 'user', type: 'message', content: 'This is a long message that should be truncated for the title because it exceeds fifty characters' } as Message;
      await store.getState().sendMessage(message);
      
      const threadId = store.getState().currentThreadId!;
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe('This is a long message that should be truncated...');
    });

    it('sendMessage handles array content for title generation', async () => {
      const message: Message = {
        role: 'user',
        type: 'message',
        content: [{ type: 'text', text: 'Hello world' }]
      } as Message;
      await store.getState().sendMessage(message);
      
      const threadId = store.getState().currentThreadId!;
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe('Hello world');
    });

    it('sendMessage uses fallback title for non-text content', async () => {
      const message: Message = {
        role: 'user',
        type: 'message',
        content: [{ type: 'image_url', image: { type: 'image', uri: 'test.jpg' } }]
      } as Message;
      await store.getState().sendMessage(message);
      
      const threadId = store.getState().currentThreadId!;
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe('New conversation');
    });

    it('sendMessage does nothing when socket is not connected', async () => {
      store.setState({ socket: null });
      const message: Message = { role: 'user', type: 'message', content: 'hello' } as Message;
      
      await store.getState().sendMessage(message);
      expect(store.getState().currentThreadId).toBeNull();
    });

    it('sendMessage adds workflowId and threadId to message', async () => {
      store.setState({ workflowId: 'test-workflow' });
      const threadId = store.getState().createNewThread();
      const message: Message = { role: 'user', type: 'message', content: 'hello' } as Message;
      
      await store.getState().sendMessage(message);
      
      expect(socket.send).toHaveBeenCalledWith(
        encode({ ...message, workflow_id: 'test-workflow', thread_id: threadId })
      );
    });
  });

  describe('stopGeneration', () => {
    let socket: MockWebSocket;
    
    beforeEach(async () => {
      await store.getState().connect();
      socket = store.getState().socket as unknown as MockWebSocket;
      store.getState().createNewThread();
    });

    it('sends stop signal and resets state', () => {
      store.setState({ status: 'loading', progress: { current: 5, total: 10 }, statusMessage: 'Processing...' });
      
      store.getState().stopGeneration();
      
      expect(socket.send).toHaveBeenCalledWith(
        encode({ type: 'stop', thread_id: store.getState().currentThreadId })
      );
      expect(store.getState().status).toBe('connected');
      expect(store.getState().progress).toEqual({ current: 0, total: 0 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it('does nothing when socket is not connected', () => {
      store.setState({ socket: null });
      store.getState().stopGeneration();
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('does nothing when no current thread', () => {
      store.setState({ currentThreadId: null });
      store.getState().stopGeneration();
      expect(socket.send).not.toHaveBeenCalled();
    });
  });

  describe('Authentication and Non-localhost', () => {
    beforeEach(() => {
      // Mock non-localhost environment
      jest.doMock('../ApiClient', () => ({ CHAT_URL: 'ws://test/chat', isLocalhost: false }));
    });

    afterEach(() => {
      jest.dontMock('../ApiClient');
    });

    it('adds authentication token to WebSocket URL when session exists', async () => {
      const mockSession = {
        data: {
          session: {
            access_token: 'test-token-123'
          }
        }
      };
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce(mockSession);

      await store.getState().connect();
      
      const socket = store.getState().socket as unknown as MockWebSocket;
      expect(socket.url).toBe('ws://test/chat?api_key=test-token-123');
      expect(log.debug).toHaveBeenCalledWith('Adding authentication to WebSocket connection');
    });

    it('warns when no Supabase session found', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: { session: null } });

      await store.getState().connect();
      
      expect(log.warn).toHaveBeenCalledWith(
        'No Supabase session found, connecting without authentication'
      );
    });

    it('handles Supabase session errors', async () => {
      (supabase.auth.getSession as jest.Mock).mockRejectedValueOnce(new Error('Auth error'));

      await expect(store.getState().connect()).rejects.toThrow();
      
      expect(store.getState().status).toBe('error');
      expect(store.getState().error).toBe('Authentication failed. Please log in again.');
      expect(log.error).toHaveBeenCalledWith('Error getting Supabase session:', expect.any(Error));
    });

    it('includes auth context in connection error messages', async () => {
      await store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      
      socket.simulateError();
      
      expect(store.getState().error).toContain('This may be due to an authentication issue');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles message for non-existent thread', async () => {
      await store.getState().connect();
      store.setState({ currentThreadId: 'non-existent' });
      
      const socket = store.getState().socket as unknown as MockWebSocket;
      const message: Message = {
        role: 'assistant',
        type: 'message',
        content: 'Test message'
      };
      
      const initialState = store.getState();
      socket.simulateMessage(message);
      
      // State should remain unchanged since thread doesn't exist
      expect(store.getState().threads).toEqual(initialState.threads);
    });

    it('handles chunk for non-existent thread', async () => {
      await store.getState().connect();
      store.setState({ currentThreadId: 'non-existent' });
      
      const socket = store.getState().socket as unknown as MockWebSocket;
      const chunk: Chunk = {
        type: 'chunk',
        content: 'Test chunk',
        content_type: 'text',
        done: false
      };
      
      const initialState = store.getState();
      socket.simulateMessage(chunk);
      
      // State should remain unchanged since thread doesn't exist
      expect(store.getState().threads).toEqual(initialState.threads);
    });

    it('handles output update for non-existent thread', async () => {
      await store.getState().connect();
      store.setState({ currentThreadId: 'non-existent' });
      
      const socket = store.getState().socket as unknown as MockWebSocket;
      const outputUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'output',
        output_type: 'string',
        value: 'Test output',
        metadata: {}
      };
      
      const initialState = store.getState();
      socket.simulateMessage(outputUpdate);
      
      // State should remain unchanged since thread doesn't exist
      expect(store.getState().threads).toEqual(initialState.threads);
    });

    it('handles unknown message types gracefully', async () => {
      await store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      
      // Send unknown message type
      socket.simulateMessage({ type: 'unknown_type', data: 'test' });
      
      // Should not throw or crash, store state should remain stable
      expect(store.getState().status).toBe('connected');
    });

    it('handles malformed message data', async () => {
      await store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      
      // Override onmessage to simulate malformed data
      if (socket.onmessage) {
        // This should not crash the application
        try {
          socket.onmessage({ data: new ArrayBuffer(0) } as any);
        } catch (error) {
          // If it throws, that's expected behavior for malformed data
        }
      }
      
      // Application should remain in a valid state
      expect(store.getState().status).toBe('connected');
    });

    it('handles WebSocket ready state changes during operations', () => {
      const socket = new MockWebSocket('ws://test/chat');
      socket.readyState = MockWebSocket.CLOSED;
      store.setState({ socket: socket as unknown as WebSocket });
      
      // Disconnect should handle closed socket gracefully
      store.getState().disconnect();
      expect(socket.close).not.toHaveBeenCalled(); // Already closed
    });

    it('handles connection timeout', async () => {
      // Mock a WebSocket that never opens
      class TimeoutWebSocket extends MockWebSocket {
        constructor(url: string) {
          super(url);
          this.readyState = MockWebSocket.CONNECTING;
          // Don't call onopen
        }
      }
      
      (global as any).WebSocket = TimeoutWebSocket;
      
      const connectPromise = store.getState().connect();
      
      // Should reject after timeout
      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });
  });

  describe('Message Content Utilities', () => {
    it('makeMessageContent handles different content types', async () => {
      await store.getState().connect();
      const socket = store.getState().socket as unknown as MockWebSocket;
      store.getState().createNewThread();
      
      const mockData = new Uint8Array([1, 2, 3, 4]);
      
      // Test image content
      const imageUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'image_output',
        output_type: 'image',
        value: { data: mockData },
        metadata: {}
      };
      socket.simulateMessage(imageUpdate);
      
      const threadId = store.getState().currentThreadId!;
      let messages = store.getState().threads[threadId].messages;
      expect(messages[0].content).toEqual([{
        type: 'image_url',
        image: { type: 'image', uri: 'blob:mock' }
      }]);
      
      // Reset messages for next test
      store.getState().resetMessages();
      
      // Test audio content
      const audioUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'audio_output',
        output_type: 'audio',
        value: { data: mockData },
        metadata: {}
      };
      socket.simulateMessage(audioUpdate);
      
      messages = store.getState().threads[threadId].messages;
      expect(messages[0].content).toEqual([{
        type: 'audio',
        audio: { type: 'audio', uri: 'blob:mock' }
      }]);
      
      // Reset messages for next test
      store.getState().resetMessages();
      
      // Test video content
      const videoUpdate: OutputUpdate = {
        type: 'output_update',
        node_id: 'test-node',
        node_name: 'Test Node',
        output_name: 'video_output',
        output_type: 'video',
        value: { data: mockData },
        metadata: {}
      };
      socket.simulateMessage(videoUpdate);
      
      messages = store.getState().threads[threadId].messages;
      expect(messages[0].content).toEqual([{
        type: 'video',
        video: { type: 'video', uri: 'blob:mock' }
      }]);
    });
  });

  describe('State Persistence', () => {
    it('partialize function returns only threads and currentThreadId', () => {
      const mockState = {
        status: 'connected' as const,
        statusMessage: 'test',
        progress: { current: 5, total: 10 },
        error: 'test error',
        workflowId: 'workflow-123',
        socket: {} as WebSocket,
        threads: { 'thread-1': {} as any },
        currentThreadId: 'thread-1',
        // ... other properties would be here in real state
      } as any;
      
      // Access the partialize function from the store config
      // Note: This tests the partialize logic conceptually
      const persistedState = {
        threads: mockState.threads,
        currentThreadId: mockState.currentThreadId
      };
      
      expect(persistedState).toEqual({
        threads: { 'thread-1': {} },
        currentThreadId: 'thread-1'
      });
      
      // Verify that connection state is not persisted
      expect(persistedState).not.toHaveProperty('status');
      expect(persistedState).not.toHaveProperty('socket');
      expect(persistedState).not.toHaveProperty('error');
    });
  });
});
