/**
 * Tests for ChatStore
 */

import { useChatStore } from './ChatStore';
import { WebSocketManager } from '../services/WebSocketManager';
import { apiService } from '../services/api';

// Mock WebSocketManager
jest.mock('../services/WebSocketManager', () => ({
  WebSocketManager: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    destroy: jest.fn(),
    send: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    setCallbacks: jest.fn(),
    getState: jest.fn().mockReturnValue('connected'),
  })),
}));

// Mock apiService
jest.mock('../services/api', () => ({
  apiService: {
    getWebSocketUrl: jest.fn().mockReturnValue('ws://localhost:8000/ws/chat'),
  },
}));

describe('ChatStore', () => {
  let mockWsManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the store
    useChatStore.setState({
      status: 'disconnected',
      statusMessage: null,
      error: null,
      wsManager: null,
      threads: {},
      currentThreadId: null,
      messageCache: {},
      isLoadingMessages: false,
    });

    // Setup mock WebSocket manager
    mockWsManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      destroy: jest.fn(),
      send: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      setCallbacks: jest.fn(),
      getState: jest.fn().mockReturnValue('connected'),
    };
    
    (WebSocketManager as jest.Mock).mockImplementation(() => mockWsManager);
  });

  describe('Initial state', () => {
    it('has correct initial values', () => {
      const state = useChatStore.getState();
      
      expect(state.status).toBe('disconnected');
      expect(state.statusMessage).toBeNull();
      expect(state.error).toBeNull();
      expect(state.wsManager).toBeNull();
      expect(state.threads).toEqual({});
      expect(state.currentThreadId).toBeNull();
      expect(state.messageCache).toEqual({});
      expect(state.isLoadingMessages).toBe(false);
    });
  });

  describe('connect', () => {
    it('creates WebSocketManager with correct URL', async () => {
      await useChatStore.getState().connect();
      
      expect(apiService.getWebSocketUrl).toHaveBeenCalledWith('/ws/chat');
      expect(WebSocketManager).toHaveBeenCalledWith(expect.objectContaining({
        url: 'ws://localhost:8000/ws/chat',
        reconnect: true,
      }));
    });

    it('sets up callbacks on WebSocketManager', async () => {
      await useChatStore.getState().connect();
      
      expect(mockWsManager.setCallbacks).toHaveBeenCalledWith(expect.objectContaining({
        onStateChange: expect.any(Function),
        onMessage: expect.any(Function),
        onError: expect.any(Function),
        onReconnecting: expect.any(Function),
      }));
    });

    it('stores WebSocketManager instance', async () => {
      await useChatStore.getState().connect();
      
      expect(useChatStore.getState().wsManager).toBe(mockWsManager);
    });

    it('clears error on connect', async () => {
      useChatStore.setState({ error: 'Previous error' });
      
      await useChatStore.getState().connect();
      
      expect(useChatStore.getState().error).toBeNull();
    });

    it('destroys existing connection before creating new one', async () => {
      const oldManager = {
        destroy: jest.fn(),
      };
      useChatStore.setState({ wsManager: oldManager as any });
      
      await useChatStore.getState().connect();
      
      expect(oldManager.destroy).toHaveBeenCalled();
    });

    it('throws error on connection failure', async () => {
      mockWsManager.connect.mockRejectedValue(new Error('Connection failed'));
      
      await expect(useChatStore.getState().connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('calls disconnect and destroy on WebSocketManager', async () => {
      await useChatStore.getState().connect();
      
      useChatStore.getState().disconnect();
      
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(mockWsManager.destroy).toHaveBeenCalled();
    });

    it('resets state on disconnect', async () => {
      await useChatStore.getState().connect();
      useChatStore.setState({ error: 'Some error', statusMessage: 'Some status' });
      
      useChatStore.getState().disconnect();
      
      const state = useChatStore.getState();
      expect(state.wsManager).toBeNull();
      expect(state.status).toBe('disconnected');
      expect(state.error).toBeNull();
      expect(state.statusMessage).toBeNull();
    });

    it('handles disconnect when not connected', () => {
      // Should not throw
      useChatStore.getState().disconnect();
      
      expect(useChatStore.getState().status).toBe('disconnected');
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      await useChatStore.getState().connect();
      await useChatStore.getState().createNewThread();
    });

    it('sends message via WebSocket', async () => {
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: 'Hello' } as any],
        'Hello'
      );
      
      expect(mockWsManager.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      }));
    });

    it('adds message to cache optimistically', async () => {
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: 'Hello' } as any],
        'Hello'
      );
      
      const messages = useChatStore.getState().getCurrentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
    });

    it('sets status to loading', async () => {
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: 'Hello' } as any],
        'Hello'
      );
      
      expect(useChatStore.getState().status).toBe('loading');
    });

    it('creates new thread if none exists', async () => {
      useChatStore.setState({ currentThreadId: null });
      
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: 'Hello' } as any],
        'Hello'
      );
      
      expect(useChatStore.getState().currentThreadId).toBeTruthy();
    });

    it('sets error if not connected', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: 'Hello' } as any],
        'Hello'
      );
      
      expect(useChatStore.getState().error).toBe('Not connected to chat service');
    });

    it('updates thread title on first message', async () => {
      const threadId = useChatStore.getState().currentThreadId!;
      
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: 'Hello World Test' } as any],
        'Hello World Test'
      );
      
      const thread = useChatStore.getState().threads[threadId];
      expect(thread.title).toBe('Hello World Test');
    });

    it('truncates long titles', async () => {
      const longText = 'A'.repeat(100);
      const threadId = useChatStore.getState().currentThreadId!;
      
      await useChatStore.getState().sendMessage(
        [{ type: 'text', text: longText } as any],
        longText
      );
      
      const thread = useChatStore.getState().threads[threadId];
      expect(thread.title?.length ?? 0).toBeLessThanOrEqual(53); // 50 + '...'
    });

    it('handles send error', async () => {
      mockWsManager.send.mockImplementation(() => {
        throw new Error('Send failed');
      });
      
      await expect(
        useChatStore.getState().sendMessage(
          [{ type: 'text', text: 'Hello' } as any],
          'Hello'
        )
      ).rejects.toThrow('Send failed');
    });
  });

  describe('stopGeneration', () => {
    beforeEach(async () => {
      await useChatStore.getState().connect();
      await useChatStore.getState().createNewThread();
    });

    it('sends stop signal', () => {
      useChatStore.getState().stopGeneration();
      
      expect(mockWsManager.send).toHaveBeenCalledWith({
        type: 'stop',
        thread_id: useChatStore.getState().currentThreadId,
      });
    });

    it('resets status to connected', () => {
      useChatStore.setState({ status: 'loading' });
      
      useChatStore.getState().stopGeneration();
      
      expect(useChatStore.getState().status).toBe('connected');
    });

    it('does nothing if not connected', () => {
      mockWsManager.isConnected.mockReturnValue(false);
      mockWsManager.send.mockClear();
      
      useChatStore.getState().stopGeneration();
      
      expect(mockWsManager.send).not.toHaveBeenCalled();
    });

    it('does nothing if no current thread', () => {
      useChatStore.setState({ currentThreadId: null });
      mockWsManager.send.mockClear();
      
      useChatStore.getState().stopGeneration();
      
      expect(mockWsManager.send).not.toHaveBeenCalled();
    });

    it('handles send error', () => {
      mockWsManager.send.mockImplementation(() => {
        throw new Error('Send failed');
      });
      
      useChatStore.getState().stopGeneration();
      
      expect(useChatStore.getState().error).toBe('Failed to stop generation');
      expect(useChatStore.getState().status).toBe('error');
    });
  });

  describe('createNewThread', () => {
    it('creates thread with generated id', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      expect(threadId).toBe('test-uuid-1234');
    });

    it('adds thread to threads map', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      expect(useChatStore.getState().threads[threadId]).toBeTruthy();
    });

    it('sets current thread id', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      expect(useChatStore.getState().currentThreadId).toBe(threadId);
    });

    it('initializes message cache for thread', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      expect(useChatStore.getState().messageCache[threadId]).toEqual([]);
    });

    it('uses custom title if provided', async () => {
      const threadId = await useChatStore.getState().createNewThread('Custom Title');
      
      expect(useChatStore.getState().threads[threadId].title).toBe('Custom Title');
    });

    it('uses default title if not provided', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      expect(useChatStore.getState().threads[threadId].title).toBe('New conversation');
    });
  });

  describe('switchThread', () => {
    beforeEach(async () => {
      await useChatStore.getState().createNewThread();
    });

    it('switches to existing thread', async () => {
      // Add second thread manually
      const thread2 = { id: 'thread-2', title: 'Thread 2' } as any;
      useChatStore.setState({
        threads: {
          ...useChatStore.getState().threads,
          'thread-2': thread2,
        },
      });
      
      useChatStore.getState().switchThread('thread-2');
      
      expect(useChatStore.getState().currentThreadId).toBe('thread-2');
    });

    it('does nothing if thread does not exist', () => {
      const initialThreadId = useChatStore.getState().currentThreadId;
      
      useChatStore.getState().switchThread('non-existent');
      
      expect(useChatStore.getState().currentThreadId).toBe(initialThreadId);
    });
  });

  describe('getCurrentMessages', () => {
    it('returns empty array if no current thread', () => {
      expect(useChatStore.getState().getCurrentMessages()).toEqual([]);
    });

    it('returns messages for current thread', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      useChatStore.setState({
        messageCache: {
          [threadId]: [
            { id: '1', type: 'message', role: 'user', content: 'Hello' },
          ] as any,
        },
      });
      
      expect(useChatStore.getState().getCurrentMessages()).toHaveLength(1);
    });

    it('returns empty array if thread has no messages', async () => {
      await useChatStore.getState().createNewThread();
      
      expect(useChatStore.getState().getCurrentMessages()).toEqual([]);
    });
  });

  describe('resetMessages', () => {
    beforeEach(async () => {
      const threadId = await useChatStore.getState().createNewThread();
      useChatStore.setState({
        messageCache: {
          [threadId]: [
            { id: '1', type: 'message', role: 'user', content: 'Hello' },
          ] as any,
        },
      });
    });

    it('clears messages for current thread', () => {
      const threadId = useChatStore.getState().currentThreadId!;
      
      useChatStore.getState().resetMessages();
      
      expect(useChatStore.getState().messageCache[threadId]).toEqual([]);
    });

    it('does nothing if no current thread', () => {
      useChatStore.setState({ currentThreadId: null });
      
      // Should not throw
      useChatStore.getState().resetMessages();
      
      expect(true).toBe(true);
    });
  });

  describe('addMessageToCache', () => {
    it('adds message to specified thread', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      useChatStore.getState().addMessageToCache(threadId, {
        id: 'msg-1',
        type: 'message',
        role: 'user',
        content: 'Test',
      } as any);
      
      expect(useChatStore.getState().messageCache[threadId]).toHaveLength(1);
    });

    it('creates message array if thread not in cache', () => {
      useChatStore.getState().addMessageToCache('new-thread', {
        id: 'msg-1',
        type: 'message',
        role: 'user',
        content: 'Test',
      } as any);
      
      expect(useChatStore.getState().messageCache['new-thread']).toHaveLength(1);
    });

    it('appends to existing messages', async () => {
      const threadId = await useChatStore.getState().createNewThread();
      
      useChatStore.getState().addMessageToCache(threadId, {
        id: 'msg-1',
        type: 'message',
        role: 'user',
        content: 'First',
      } as any);
      
      useChatStore.getState().addMessageToCache(threadId, {
        id: 'msg-2',
        type: 'message',
        role: 'assistant',
        content: 'Second',
      } as any);
      
      expect(useChatStore.getState().messageCache[threadId]).toHaveLength(2);
    });
  });

  describe('setStatus', () => {
    it('updates status', () => {
      useChatStore.getState().setStatus('loading');
      
      expect(useChatStore.getState().status).toBe('loading');
    });
  });

  describe('setError', () => {
    it('updates error', () => {
      useChatStore.getState().setError('Test error');
      
      expect(useChatStore.getState().error).toBe('Test error');
    });

    it('clears error when null', () => {
      useChatStore.setState({ error: 'Existing error' });
      
      useChatStore.getState().setError(null);
      
      expect(useChatStore.getState().error).toBeNull();
    });
  });

  describe('WebSocket callbacks', () => {
    let callbacks: any;

    beforeEach(async () => {
      await useChatStore.getState().connect();
      callbacks = mockWsManager.setCallbacks.mock.calls[0][0];
      await useChatStore.getState().createNewThread();
    });

    describe('onStateChange', () => {
      it('updates status on state change', () => {
        callbacks.onStateChange('connecting');
        
        expect(useChatStore.getState().status).toBe('connecting');
      });

      it('does not override loading/streaming status when connected', () => {
        useChatStore.setState({ status: 'loading' });
        
        callbacks.onStateChange('connected');
        
        expect(useChatStore.getState().status).toBe('loading');
      });
    });

    describe('onError', () => {
      it('sets error message', () => {
        callbacks.onError(new Error('Connection error'));
        
        expect(useChatStore.getState().error).toBe('Connection error');
      });
    });

    describe('onReconnecting', () => {
      it('sets status message', () => {
        callbacks.onReconnecting(2, 5);
        
        expect(useChatStore.getState().statusMessage).toBe('Reconnecting... (2/5)');
      });
    });

    describe('onMessage', () => {
      it('handles message type', () => {
        const threadId = useChatStore.getState().currentThreadId;
        
        callbacks.onMessage({
          type: 'message',
          role: 'assistant',
          content: 'Hello',
          thread_id: threadId,
        });
        
        expect(useChatStore.getState().getCurrentMessages()).toHaveLength(1);
      });

      it('handles chunk type - creates new message', () => {
        callbacks.onMessage({
          type: 'chunk',
          content: 'Hello',
          done: false,
        });
        
        expect(useChatStore.getState().status).toBe('streaming');
        expect(useChatStore.getState().getCurrentMessages()).toHaveLength(1);
      });

      it('handles chunk type - appends to existing assistant message', () => {
        // First add an assistant message
        const threadId = useChatStore.getState().currentThreadId!;
        useChatStore.setState({
          messageCache: {
            [threadId]: [{
              id: 'local-stream-1',
              type: 'message',
              role: 'assistant',
              content: 'Hello',
            }] as any,
          },
        });
        
        callbacks.onMessage({
          type: 'chunk',
          content: ' World',
          done: false,
        });
        
        const messages = useChatStore.getState().getCurrentMessages();
        expect(messages[0].content).toBe('Hello World');
      });

      it('handles chunk done', () => {
        callbacks.onMessage({
          type: 'chunk',
          content: 'Hello',
          done: true,
        });
        
        expect(useChatStore.getState().status).toBe('connected');
      });

      it('handles job_update completed', () => {
        useChatStore.setState({ status: 'loading' });
        
        callbacks.onMessage({
          type: 'job_update',
          status: 'completed',
        });
        
        expect(useChatStore.getState().status).toBe('connected');
      });

      it('handles job_update failed', () => {
        callbacks.onMessage({
          type: 'job_update',
          status: 'failed',
          error: 'Job error',
        });
        
        expect(useChatStore.getState().status).toBe('error');
        expect(useChatStore.getState().error).toBe('Job error');
      });

      it('handles job_update failed without error message', () => {
        callbacks.onMessage({
          type: 'job_update',
          status: 'failed',
        });
        
        expect(useChatStore.getState().error).toBe('Job failed');
      });

      it('handles node_update running', () => {
        callbacks.onMessage({
          type: 'node_update',
          status: 'running',
          node_name: 'TestNode',
        });
        
        expect(useChatStore.getState().statusMessage).toBe('TestNode');
      });

      it('handles node_update completed', () => {
        callbacks.onMessage({
          type: 'node_update',
          status: 'completed',
        });
        
        expect(useChatStore.getState().status).toBe('connected');
      });

      it('handles generation_stopped', () => {
        useChatStore.setState({ status: 'loading' });
        
        callbacks.onMessage({
          type: 'generation_stopped',
        });
        
        expect(useChatStore.getState().status).toBe('connected');
      });

      it('handles error type', () => {
        callbacks.onMessage({
          type: 'error',
          message: 'Server error',
        });
        
        expect(useChatStore.getState().status).toBe('error');
        expect(useChatStore.getState().error).toBe('Server error');
      });

      it('handles error type without message', () => {
        callbacks.onMessage({
          type: 'error',
        });
        
        expect(useChatStore.getState().error).toBe('An error occurred');
      });

      it('ignores unknown message types', () => {
        const initialStatus = useChatStore.getState().status;
        
        callbacks.onMessage({
          type: 'unknown_type',
        });
        
        expect(useChatStore.getState().status).toBe(initialStatus);
      });

      it('ignores non-essential messages while stopping', () => {
        useChatStore.setState({ status: 'stopping' });
        
        callbacks.onMessage({
          type: 'chunk',
          content: 'Should be ignored',
          done: false,
        });
        
        // No new message should be added
        expect(useChatStore.getState().getCurrentMessages()).toHaveLength(0);
      });

      it('processes generation_stopped while stopping', () => {
        useChatStore.setState({ status: 'stopping' });
        
        callbacks.onMessage({
          type: 'generation_stopped',
        });
        
        expect(useChatStore.getState().status).toBe('connected');
      });

      it('handles message without thread_id using current thread', () => {
        const threadId = useChatStore.getState().currentThreadId;
        
        callbacks.onMessage({
          type: 'message',
          role: 'assistant',
          content: 'Hello',
          // No thread_id
        });
        
        expect(useChatStore.getState().messageCache[threadId!]).toHaveLength(1);
      });

      it('replaces streaming placeholder with final message', () => {
        const threadId = useChatStore.getState().currentThreadId!;
        
        // Add streaming placeholder
        useChatStore.setState({
          messageCache: {
            [threadId]: [{
              id: 'local-stream-1',
              type: 'message',
              role: 'assistant',
              content: 'Streaming...',
            }] as any,
          },
        });
        
        // Send final message
        callbacks.onMessage({
          type: 'message',
          id: 'server-123',
          role: 'assistant',
          content: 'Final content',
          thread_id: threadId,
        });
        
        const messages = useChatStore.getState().getCurrentMessages();
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe('Final content');
      });
    });
  });

  describe('setSelectedModel', () => {
    it('sets the selected language model', () => {
      const model = {
        type: 'language_model' as const,
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai' as const,
      };

      useChatStore.getState().setSelectedModel(model);
      
      expect(useChatStore.getState().selectedModel).toEqual(model);
    });

    it('replaces previously selected model', () => {
      const model1 = {
        type: 'language_model' as const,
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai' as const,
      };
      
      const model2 = {
        type: 'language_model' as const,
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai' as const,
      };

      useChatStore.getState().setSelectedModel(model1);
      expect(useChatStore.getState().selectedModel).toEqual(model1);
      
      useChatStore.getState().setSelectedModel(model2);
      expect(useChatStore.getState().selectedModel).toEqual(model2);
    });
  });
});
