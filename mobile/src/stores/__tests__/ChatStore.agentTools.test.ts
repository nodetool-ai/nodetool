/**
 * The chat store's half of the agent tool contract: advertise the client tools
 * on every open, dispatch an incoming `tool_call`, and attach `ui_context` to
 * outgoing turns.
 */

import { useChatStore } from '../ChatStore';
import { WebSocketManager } from '../../services/WebSocketManager';
import {
  registerDocumentHandler,
  resetDocumentHandlers,
  setFocusedDocument,
} from '../../documents/agentBridge';
import { MobileToolRegistry } from '../../documents/tools/registry';

jest.mock('../../services/WebSocketManager', () => ({
  WebSocketManager: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  apiService: {
    getWebSocketUrl: jest.fn().mockReturnValue('ws://localhost:7777/ws'),
  },
}));

interface Callbacks {
  onOpen?: () => void;
  onMessage?: (data: unknown) => void;
}

describe('ChatStore agent tool wiring', () => {
  let socket: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    destroy: jest.Mock;
    send: jest.Mock;
    isConnected: jest.Mock;
    setCallbacks: jest.Mock;
    getState: jest.Mock;
  };
  let callbacks: Callbacks;

  beforeEach(() => {
    jest.clearAllMocks();
    resetDocumentHandlers();

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

    callbacks = {};
    socket = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      destroy: jest.fn(),
      send: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      setCallbacks: jest.fn((next: Callbacks) => {
        callbacks = next;
      }),
      getState: jest.fn().mockReturnValue('connected'),
    };
    (WebSocketManager as unknown as jest.Mock).mockImplementation(() => socket);
  });

  afterEach(() => {
    // `sendMessage` arms a five-minute response timeout. Disconnecting clears
    // it; left running it holds the Jest process open after the suite passes.
    useChatStore.getState().disconnect();
  });

  /** The messages of one type the store pushed onto the socket. */
  const sentOfType = <T,>(type: string): T[] =>
    socket.send.mock.calls
      .map((call) => call[0] as { type: string })
      .filter((message) => message.type === type) as T[];

  it('advertises the ui_* tools when the socket opens', async () => {
    await useChatStore.getState().connect();

    callbacks.onOpen?.();

    const [manifest] = sentOfType<{ tools: { name: string }[] }>(
      'client_tools_manifest'
    );
    expect(manifest).toBeDefined();
    const names = manifest.tools.map((tool) => tool.name);
    expect(names).toContain('ui_storyboard_get_state');
    expect(names).toContain('ui_timeline_get_state');
  });

  it('re-advertises on every open, so a reconnect does not lose the tools', async () => {
    await useChatStore.getState().connect();

    callbacks.onOpen?.();
    callbacks.onOpen?.();

    expect(sentOfType('client_tools_manifest')).toHaveLength(2);
  });

  it('answers a tool_call with a tool_result on the same id', async () => {
    await useChatStore.getState().connect();
    registerDocumentHandler('storyboard', 'sb1', 'Board', {
      getSnapshot: () => ({ boardId: 'sb1', title: 'Board', shots: [] }),
    });

    callbacks.onMessage?.({
      type: 'tool_call',
      tool_call_id: 'call-7',
      name: 'ui_storyboard_get_state',
      args: { storyboard_id: 'sb1' },
      thread_id: 'thread-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    const [result] = sentOfType<{ tool_call_id: string; ok: boolean }>(
      'tool_result'
    );
    expect(result).toMatchObject({ tool_call_id: 'call-7', ok: true });
  });

  it('reports the failure when the addressed document is not open', async () => {
    await useChatStore.getState().connect();

    callbacks.onMessage?.({
      type: 'tool_call',
      tool_call_id: 'call-8',
      name: 'ui_storyboard_get_state',
      args: { storyboard_id: 'missing' },
      thread_id: 'thread-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    const [result] = sentOfType<{ ok: boolean; error: string }>('tool_result');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No storyboard "missing" is open/);
  });

  it('does not treat a tool_call as a chat message', async () => {
    await useChatStore.getState().connect();
    useChatStore.setState({ currentThreadId: 'thread-1' });

    callbacks.onMessage?.({
      type: 'tool_call',
      tool_call_id: 'call-9',
      name: 'ui_unknown',
      args: {},
      thread_id: 'thread-1',
    });
    await Promise.resolve();

    expect(useChatStore.getState().messageCache['thread-1']).toBeUndefined();
  });

  it('attaches the open documents to an outgoing turn', async () => {
    await useChatStore.getState().connect();
    useChatStore.setState({ currentThreadId: 'thread-1' });
    registerDocumentHandler('storyboard', 'sb1', 'Chase scene', {});
    setFocusedDocument('storyboard', 'sb1');

    await useChatStore
      .getState()
      .sendMessage([{ type: 'text', text: 'add a shot' }], 'add a shot');

    const [turn] = sentOfType<{
      ui_context?: {
        open: { type: string; id: string; title: string }[];
        focused: { id: string } | null;
      };
    }>('message');
    expect(turn.ui_context?.open).toEqual([
      { type: 'storyboard', id: 'sb1', title: 'Chase scene' },
    ]);
    expect(turn.ui_context?.focused).toMatchObject({ id: 'sb1' });
  });

  it('omits ui_context when no document is open', async () => {
    await useChatStore.getState().connect();
    useChatStore.setState({ currentThreadId: 'thread-1' });

    await useChatStore
      .getState()
      .sendMessage([{ type: 'text', text: 'hello' }], 'hello');

    const [turn] = sentOfType<{ ui_context?: unknown }>('message');
    expect(turn.ui_context).toBeUndefined();
  });

  it('registers no tool outside the ui_ namespace', () => {
    for (const name of MobileToolRegistry.names()) {
      expect(name.startsWith('ui_')).toBe(true);
    }
  });
});
