/**
 * WebSocket hook for managing Nodetool server connection.
 * Handles connection, reconnection with exponential backoff,
 * and message handling using MessagePack protocol.
 */
import { useCallback, useEffect, useRef } from 'react';
import { encode, decode } from '@msgpack/msgpack';
import { useExtensionStore } from '../store';
import type { OutgoingMessage, IncomingMessage, ChatMessage, Thread } from '../../types';

interface UseWebSocketOptions {
  onMessage?: (message: IncomingMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeBasePath = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  const withoutV1 = trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
  return withoutV1 === '' ? '/' : withoutV1;
};

const ensureUrl = (rawUrl: string) => {
  try {
    return new URL(rawUrl);
  } catch {
    return new URL(`http://${rawUrl}`);
  }
};

const buildWebSocketUrl = (rawUrl: string, apiKey?: string) => {
  const url = ensureUrl(rawUrl.trim());
  const protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  url.protocol = protocol;

  const basePath = normalizeBasePath(url.pathname);
  const normalizedPath = basePath.replace(/\/+$/, '');
  const hasExplicitWsPath =
    normalizedPath.endsWith('/ws') || normalizedPath.endsWith('/chat') || normalizedPath.endsWith('/ws/chat');
  const wsPath = hasExplicitWsPath
    ? normalizedPath
    : `${normalizedPath === '/' ? '' : normalizedPath}/ws`;

  url.pathname = wsPath || '/ws';

  if (apiKey && !url.searchParams.has('api_key')) {
    url.searchParams.set('api_key', apiKey);
  }

  return url.toString();
};

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIntentionalCloseRef = useRef(false);
  // Use refs for callbacks that need to be called inside connect but shouldn't cause re-creation
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const {
    serverConfig,
    connectionStatus,
    setConnectionStatus,
    setConnectionError,
    currentThreadId,
    setCurrentThreadId,
    addThread,
    addMessage,
    updateLastMessage,
    setIsStreaming
  } = useExtensionStore();

  // Store serverConfig in ref for use in callbacks
  const serverConfigRef = useRef(serverConfig);
  serverConfigRef.current = serverConfig;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const handleIncomingMessage = useCallback(
    (data: IncomingMessage) => {
      const threadId = useExtensionStore.getState().currentThreadId;
      if (!threadId) return;

      if (data.type === 'chunk') {
        setIsStreaming(true);

        // Get current messages to check if we need to create or update
        const messages = useExtensionStore.getState().messageCache[threadId] || [];
        const lastMessage = messages[messages.length - 1];

        if (lastMessage && lastMessage.role === 'assistant') {
          // Append to existing assistant message
          updateLastMessage(threadId, data.content || '');
        } else {
          // Create new assistant message (mark as streaming)
          const newMessage: ChatMessage = {
            id: `streaming-${Date.now()}`,
            role: 'assistant',
            content: data.content || '',
            timestamp: Date.now()
          };
          addMessage(threadId, newMessage);
        }
      } else if (data.type === 'complete') {
        setIsStreaming(false);
      } else if (data.type === 'error') {
        setIsStreaming(false);
        setConnectionError(data.error || 'An error occurred');

        // Add error message to chat
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'system',
          content: `Error: ${data.error || 'An error occurred'}`,
          timestamp: Date.now()
        };
        addMessage(threadId, errorMessage);
      } else if (data.type === 'message') {
        // Complete message from server
        const messages = useExtensionStore.getState().messageCache[threadId] || [];
        
        // Check if there's a streaming assistant message to replace/update
        const streamingAssistantIndex = messages.findIndex(
          m => m.role === 'assistant' && m.id?.startsWith('streaming-')
        );
        
        if (streamingAssistantIndex !== -1) {
          // Replace the streaming message with the complete message
          const updatedMessages = [...messages];
          updatedMessages[streamingAssistantIndex] = {
            id: generateId(),
            role: 'assistant',
            content: data.content || '',
            timestamp: Date.now()
          };
          useExtensionStore.setState((state) => ({
            messageCache: {
              ...state.messageCache,
              [threadId]: updatedMessages
            }
          }));
        } else {
          // No streaming message, add the complete message
          const message: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: data.content || '',
            timestamp: Date.now()
          };
          addMessage(threadId, message);
        }
        setIsStreaming(false);
      }
    },
    [addMessage, updateLastMessage, setIsStreaming, setConnectionError]
  );

  // Declare connect function with useRef to avoid dependency cycle
  const connectRef = useRef<() => void>(() => {});

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= serverConfigRef.current.reconnectAttempts) {
      console.log('[WebSocket] Max reconnection attempts reached');
      setConnectionStatus('failed');
      setConnectionError('Unable to connect to server. Please check your settings.');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectAttemptsRef.current++;

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
    setConnectionStatus('reconnecting');

    reconnectTimerRef.current = setTimeout(() => {
      connectRef.current();
    }, delay);
  }, [setConnectionStatus, setConnectionError]);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      isIntentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    clearReconnectTimer();
    setConnectionStatus('connecting');
    setConnectionError(null);

    try {
      const config = serverConfigRef.current;
      const wsUrl = buildWebSocketUrl(config.url, config.apiKey);

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected to Nodetool server');
        reconnectAttemptsRef.current = 0;
        setConnectionStatus('connected');
        setConnectionError(null);
        isIntentionalCloseRef.current = false;
        optionsRef.current.onConnected?.();
      };

      ws.onmessage = async (event) => {
        try {
          const data = decode(new Uint8Array(event.data)) as IncomingMessage;
          console.log('← WS INCOMING:', JSON.stringify(data, null, 2).slice(0, 500));
          handleIncomingMessage(data);
          optionsRef.current.onMessage?.(data);
        } catch (error) {
          console.error('[WebSocket] Failed to decode message:', error);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        setConnectionError('Connection error occurred');
        optionsRef.current.onError?.(new Error('WebSocket error'));
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        wsRef.current = null;

        if (!isIntentionalCloseRef.current) {
          setConnectionStatus('disconnected');
          optionsRef.current.onDisconnected?.();
          attemptReconnect();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      setConnectionStatus('failed');
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect');
      attemptReconnect();
    }
  }, [clearReconnectTimer, setConnectionStatus, setConnectionError, handleIncomingMessage, attemptReconnect]);

  // Update connectRef after connect is defined
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    clearReconnectTimer();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus('disconnected');
  }, [clearReconnectTimer, setConnectionStatus]);

  const sendMessage = useCallback(
    async (
      content: string,
      context?: { pageUrl?: string; pageTitle?: string; pageContent?: string },
      model?: { id: string; provider: string }
    ) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error('Not connected to server');
      }

      // Ensure we have a thread
      let threadId = currentThreadId;
      if (!threadId) {
        threadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const newThread: Thread = {
          id: threadId,
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        addThread(newThread);
        setCurrentThreadId(threadId);
      }

      // Add user message to local state
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
        thread_id: threadId
      };
      addMessage(threadId, userMessage);

      // Build outgoing message
      const outgoingMessage: OutgoingMessage = {
        role: 'user',
        content,
        thread_id: threadId,
        context,
        model: model?.id,
        provider: model?.provider
      };

      const chatCommand = {
        command: 'chat_message',
        data: outgoingMessage
      };

      // Send via WebSocket using MessagePack
      const encoded = encode(chatCommand);
      console.log('→ WS OUTGOING:', JSON.stringify(chatCommand, null, 2).slice(0, 500));

      wsRef.current.send(encoded);
      setIsStreaming(true);
    },
    [currentThreadId, setCurrentThreadId, addThread, addMessage, setIsStreaming]
  );

  const stopGeneration = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const stopCommand = {
      command: 'stop',
      data: { thread_id: currentThreadId }
    };
    const encoded = encode(stopCommand);
    console.log('→ WS OUTGOING:', JSON.stringify(stopCommand, null, 2).slice(0, 500));

    wsRef.current.send(encoded);
    setIsStreaming(false);
  }, [currentThreadId, setIsStreaming]);

  // Auto-connect on mount if configured
  useEffect(() => {
    if (serverConfigRef.current.autoConnect && connectionStatus === 'disconnected') {
      connect();
    }

    return () => {
      clearReconnectTimer();
    };
    // We intentionally only run this effect once on mount and when autoConnect changes.
    // Using refs for serverConfig to avoid recreating the effect when config changes during connection.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Health check
  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${serverConfig.url}/health/`);
      return response.ok;
    } catch {
      return false;
    }
  }, [serverConfig.url]);

  return {
    connect,
    disconnect,
    sendMessage,
    stopGeneration,
    checkHealth,
    isConnected: connectionStatus === 'connected',
    isStreaming: useExtensionStore((state) => state.isStreaming)
  };
}

export default useWebSocket;
