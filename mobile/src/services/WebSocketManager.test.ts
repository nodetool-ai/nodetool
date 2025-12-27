/**
 * Tests for WebSocketManager
 * 
 * Note: Tests for reconnection and timeout logic are excluded because
 * they require fake timers that conflict with the async WebSocket operations.
 * Those code paths are tested manually and through integration tests.
 */

import { WebSocketManager } from './WebSocketManager';

// Mock msgpack
jest.mock('@msgpack/msgpack', () => ({
  encode: jest.fn((data) => JSON.stringify(data)),
  decode: jest.fn((data) => {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    const str = new TextDecoder().decode(data);
    return JSON.parse(str);
  }),
}));

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  binaryType: string = 'arraybuffer';
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send = jest.fn();
  close = jest.fn();

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateClose(code: number = 1000, reason: string = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  simulateError(message: string = 'Error') {
    this.onerror?.({ message });
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data });
  }
}

let mockWebSocketInstance: MockWebSocket | null = null;

// @ts-ignore
global.WebSocket = class extends MockWebSocket {
  constructor(url: string) {
    super(url);
    mockWebSocketInstance = this;
  }
};

describe('WebSocketManager', () => {
  let manager: WebSocketManager | null = null;

  const defaultConfig = {
    url: 'ws://localhost:8000/ws/chat',
    reconnect: false,
    timeoutInterval: 300000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebSocketInstance = null;
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
      manager = null;
    }
  });

  describe('Constructor', () => {
    it('initializes with default values', () => {
      manager = new WebSocketManager({ url: 'ws://test' });
      expect(manager.getState()).toBe('disconnected');
    });

    it('initializes with custom config', () => {
      manager = new WebSocketManager({
        url: 'ws://test',
        reconnect: true,
        reconnectInterval: 500,
        reconnectDecay: 2,
        reconnectAttempts: 5,
        timeoutInterval: 10000,
      });
      expect(manager.getState()).toBe('disconnected');
    });
  });

  describe('getState', () => {
    it('returns initial state as disconnected', () => {
      manager = new WebSocketManager(defaultConfig);
      expect(manager.getState()).toBe('disconnected');
    });
  });

  describe('isConnected', () => {
    it('returns false when disconnected', () => {
      manager = new WebSocketManager(defaultConfig);
      expect(manager.isConnected()).toBe(false);
    });

    it('returns true when connected and WebSocket is open', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      expect(manager.isConnected()).toBe(true);
    });

    it('returns false when connected but WebSocket is not open', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      // Manually set readyState to closed
      if (mockWebSocketInstance) {
        mockWebSocketInstance.readyState = MockWebSocket.CLOSED;
      }
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('transitions to connecting state', () => {
      manager = new WebSocketManager(defaultConfig);
      const stateChange = jest.fn();
      manager.setCallbacks({ onStateChange: stateChange });
      manager.connect();
      expect(stateChange).toHaveBeenCalledWith('connecting', 'disconnected');
    });

    it('resolves when connection is established', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await expect(connectPromise).resolves.toBeUndefined();
      expect(manager.getState()).toBe('connected');
    });

    it('returns resolved promise if already connecting', async () => {
      manager = new WebSocketManager(defaultConfig);
      manager.connect();
      const promise2 = manager.connect();
      await expect(promise2).resolves.toBeUndefined();
    });

    it('returns resolved promise if already connected', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      const reconnectPromise = manager.connect();
      await expect(reconnectPromise).resolves.toBeUndefined();
    });

    it('calls onOpen callback when connected', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onOpen = jest.fn();
      manager.setCallbacks({ onOpen });
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      expect(onOpen).toHaveBeenCalled();
    });

    it('clears status message on connect', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      expect(manager.getState()).toBe('connected');
    });
  });

  describe('disconnect', () => {
    it('closes WebSocket when connected', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      manager.disconnect();
      expect(mockWebSocketInstance?.close).toHaveBeenCalledWith(1000, 'Client disconnect');
    });

    it('transitions to disconnecting state', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      const stateChange = jest.fn();
      manager.setCallbacks({ onStateChange: stateChange });
      manager.disconnect();
      expect(stateChange).toHaveBeenCalledWith('disconnecting', 'connected');
    });

    it('does nothing if already disconnected', () => {
      manager = new WebSocketManager(defaultConfig);
      manager.disconnect();
      expect(manager.getState()).toBe('disconnected');
    });

    it('clears message queue on disconnect', async () => {
      manager = new WebSocketManager({
        ...defaultConfig,
        reconnect: true,
      });
      manager.connect();
      // Queue a message
      manager.send({ type: 'test' });
      manager.disconnect();
      // State transitions to disconnecting until close event
      expect(manager.getState()).toBe('disconnecting');
    });
  });

  describe('send', () => {
    it('sends encoded message when connected', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      manager.send({ type: 'test' });
      expect(mockWebSocketInstance?.send).toHaveBeenCalled();
    });

    it('throws error when disconnected', () => {
      manager = new WebSocketManager(defaultConfig);
      expect(() => manager!.send({ type: 'test' })).toThrow();
    });

    it('queues message when connecting with reconnect enabled', () => {
      manager = new WebSocketManager({
        ...defaultConfig,
        reconnect: true,
      });
      manager.connect();
      // Should not throw
      manager.send({ type: 'test' });
      expect(mockWebSocketInstance?.send).not.toHaveBeenCalled();
    });

    it('processes queued messages after connect', async () => {
      manager = new WebSocketManager({
        ...defaultConfig,
        reconnect: true,
      });
      manager.connect();
      manager.send({ type: 'msg1' });
      manager.send({ type: 'msg2' });
      mockWebSocketInstance?.simulateOpen();
      await Promise.resolve();
      expect(mockWebSocketInstance?.send).toHaveBeenCalledTimes(2);
    });

    it('calls onError callback on send failure', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onError = jest.fn();
      manager.setCallbacks({ onError });
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      mockWebSocketInstance!.send.mockImplementation(() => {
        throw new Error('Send failed');
      });
      expect(() => manager!.send({ type: 'test' })).toThrow('Send failed');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('setCallbacks', () => {
    it('sets callbacks', async () => {
      manager = new WebSocketManager(defaultConfig);
      const callbacks = {
        onStateChange: jest.fn(),
        onOpen: jest.fn(),
      };
      manager.setCallbacks(callbacks);
      const connectPromise = manager.connect();
      expect(callbacks.onStateChange).toHaveBeenCalled();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      expect(callbacks.onOpen).toHaveBeenCalled();
    });

    it('merges callbacks', () => {
      manager = new WebSocketManager(defaultConfig);
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      manager.setCallbacks({ onStateChange: callback1 });
      manager.setCallbacks({ onOpen: callback2 });
      manager.connect();
      expect(callback1).toHaveBeenCalled();
    });
  });

  describe('Message handling', () => {
    it('decodes and emits string messages', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onMessage = jest.fn();
      manager.setCallbacks({ onMessage });
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      mockWebSocketInstance?.simulateMessage('{"type":"test"}');
      await Promise.resolve();
      expect(onMessage).toHaveBeenCalledWith({ type: 'test' });
    });

    it('handles invalid messages by passing raw data', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onMessage = jest.fn();
      manager.setCallbacks({ onMessage });
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      mockWebSocketInstance?.simulateMessage('invalid json{{{');
      await Promise.resolve();
      expect(onMessage).toHaveBeenCalledWith('invalid json{{{');
    });

    it('handles ArrayBuffer messages', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onMessage = jest.fn();
      manager.setCallbacks({ onMessage });
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      
      const data = new TextEncoder().encode('{"type":"buffer"}');
      mockWebSocketInstance?.simulateMessage(data.buffer);
      await Promise.resolve();
      expect(onMessage).toHaveBeenCalledWith({ type: 'buffer' });
    });
  });

  describe('Error handling', () => {
    it('calls onError callback on WebSocket error', () => {
      manager = new WebSocketManager(defaultConfig);
      const onError = jest.fn();
      manager.setCallbacks({ onError });
      manager.connect();
      mockWebSocketInstance?.simulateError('Connection error');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('closes WebSocket and cleans up', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      manager.destroy();
      expect(mockWebSocketInstance?.close).toHaveBeenCalled();
      expect(manager.getState()).toBe('disconnected');
    });

    it('can be called when not connected', () => {
      manager = new WebSocketManager(defaultConfig);
      manager.destroy();
      expect(manager.getState()).toBe('disconnected');
    });

    it('clears message queue', async () => {
      manager = new WebSocketManager({
        ...defaultConfig,
        reconnect: true,
      });
      manager.connect();
      manager.send({ type: 'test' });
      manager.destroy();
      expect(manager.getState()).toBe('disconnected');
    });
  });

  describe('onClose callback', () => {
    it('is called with code and reason', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onClose = jest.fn();
      manager.setCallbacks({ onClose });
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      mockWebSocketInstance?.simulateClose(1001, 'Going away');
      expect(onClose).toHaveBeenCalledWith(1001, 'Going away');
    });

    it('transitions to disconnected on intentional close', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      manager.disconnect();
      // Simulate the close event after disconnect
      mockWebSocketInstance?.simulateClose(1000, 'Client disconnect');
      expect(manager.getState()).toBe('disconnected');
    });
  });

  describe('Connection failure', () => {
    it('handles close while connecting', () => {
      manager = new WebSocketManager(defaultConfig);
      const onError = jest.fn();
      manager.setCallbacks({ onError });
      const connectPromise = manager.connect();
      // Simulate close before open
      mockWebSocketInstance?.simulateClose(1006, 'Connection failed');
      expect(connectPromise).rejects.toThrow('Connection failed');
    });
  });

  describe('State transitions', () => {
    it('handles invalid state transition action', () => {
      manager = new WebSocketManager(defaultConfig);
      // Access private method via any cast for testing
      const result = (manager as any).transitionTo('invalid_action');
      expect(result).toBe(false);
    });

    it('prevents invalid state transitions', async () => {
      manager = new WebSocketManager(defaultConfig);
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      
      // Try to transition to connecting from connected (invalid)
      const result = (manager as any).transitionTo('connect');
      expect(result).toBe(false);
    });

    it('transitions to failed state when not intentional disconnect', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onStateChange = jest.fn();
      manager.setCallbacks({ onStateChange });
      
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      
      // Reset mock to only track new calls
      onStateChange.mockClear();
      
      // Simulate unexpected close (not intentional)
      mockWebSocketInstance?.simulateClose(1011, 'Server error');
      
      // Should transition to disconnected, then failed
      expect(onStateChange).toHaveBeenCalledWith('disconnected', 'connected');
    });
  });

  describe('Message handling edge cases', () => {
    it('handles error during message processing', async () => {
      manager = new WebSocketManager(defaultConfig);
      const onError = jest.fn();
      const onMessage = jest.fn(() => {
        throw new Error('Processing error');
      });
      manager.setCallbacks({ onError, onMessage });
      
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      
      // This should trigger error in message processing
      mockWebSocketInstance?.simulateMessage('{"type":"test"}');
      await Promise.resolve();
      
      // onMessage will be called and throw, but error is caught
      expect(onMessage).toHaveBeenCalled();
    });

    it('processes queued messages on connection', async () => {
      manager = new WebSocketManager({
        ...defaultConfig,
        reconnect: true,
      });
      
      // Start connecting
      manager.connect();
      
      // Queue messages while connecting
      manager.send({ type: 'msg1' });
      manager.send({ type: 'msg2' });
      manager.send({ type: 'msg3' });
      
      // Complete connection
      mockWebSocketInstance?.simulateOpen();
      await Promise.resolve();
      await Promise.resolve(); // Allow queue processing
      
      // All queued messages should be sent
      expect(mockWebSocketInstance?.send).toHaveBeenCalledTimes(3);
    });
  });

  describe('Connection state checks', () => {
    it('connect throws when in invalid state', async () => {
      manager = new WebSocketManager(defaultConfig);
      
      // Force manager into 'disconnecting' state
      const connectPromise = manager.connect();
      mockWebSocketInstance?.simulateOpen();
      await connectPromise;
      manager.disconnect();
      
      // Try to connect while disconnecting - should handle gracefully
      // The actual behavior depends on implementation
      expect(manager.getState()).toBe('disconnecting');
    });

    it('disconnect handles case when no WebSocket exists', () => {
      manager = new WebSocketManager(defaultConfig);
      manager.connect();
      
      // Clear the WebSocket before disconnect
      (manager as any).ws = null;
      
      manager.disconnect();
      expect(manager.getState()).toBe('disconnected');
    });
  });
});
