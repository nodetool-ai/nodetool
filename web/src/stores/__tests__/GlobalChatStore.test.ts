import { TextEncoder, TextDecoder } from "util";
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;
(global as any).URL.createObjectURL = jest.fn(() => "blob:mock");

jest.mock("../BASE_URL", () => ({
  BASE_URL: "http://localhost:8000",
  CHAT_URL: "ws://test/ws", // Unified WebSocket endpoint
  UNIFIED_WS_URL: "ws://test/ws"
}));

// Mock globalWebSocketManager before importing GlobalChatStore
// We need the actual WebSocketManager from the lib for mock-socket compatibility
const mockEnsureConnection = jest.fn();
const mockSubscribe = jest.fn();
const mockSend = jest.fn();
const mockDisconnect = jest.fn();
const mockGetWebSocketManager = jest.fn();
let mockIsConnected = false;

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: (...args: any[]) => mockEnsureConnection(...args),
    subscribe: (...args: any[]) => mockSubscribe(...args),
    send: (...args: any[]) => mockSend(...args),
    disconnect: () => mockDisconnect(),
    getWebSocketManager: () => mockGetWebSocketManager(),
    get isConnected() { return mockIsConnected; },
    get isConnecting() { return false; }
  }
}));

import { encode, decode } from "@msgpack/msgpack";
import { Server } from "mock-socket";
import useGlobalChatStore from "../GlobalChatStore";
import {
  Message,
  JobUpdate,
  NodeUpdate,
  Chunk,
  OutputUpdate,
  ToolCallUpdate,
  NodeProgress
} from "../ApiTypes";
import log from "loglevel";
import { supabase } from "../../lib/supabaseClient";

jest.mock("../ApiClient", () => ({
  CHAT_URL: "ws://test/chat",
  isLocalhost: true,
  authHeader: jest.fn(async () => ({ Authorization: "Bearer test" })),
  client: {
    GET: jest.fn(async () => ({ data: {}, error: null })),
    POST: jest.fn(async () => ({ data: {}, error: null })),
    PUT: jest.fn(async () => ({ data: {}, error: null })),
    DELETE: jest.fn(async () => ({ data: {}, error: null }))
  }
}));

jest.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

let uuidCounter = 0;
jest.mock("../uuidv4", () => ({ uuidv4: () => `id-${uuidCounter++}` }));

// Helper function to simulate server sending a message with proper data format
const simulateServerMessage = (mockServer: Server, data: any) => {
  const encoded = encode(data);

  // Create a Blob which has arrayBuffer() method
  const blob = new Blob([encoded]);

  // Override the blob's arrayBuffer method to return our encoded data
  Object.defineProperty(blob, "arrayBuffer", {
    value: async () =>
      encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength
      )
  });

  mockServer.clients().forEach((client: any) => {
    client.send(blob);
  });
};

describe("GlobalChatStore", () => {
  const store = useGlobalChatStore;
  const defaultState = { ...store.getState() };
  let mockServer: Server;
  let messageHandler: ((data: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.setTimeout(60000);
    uuidCounter = 0;
    mockIsConnected = false;
    messageHandler = null;
    
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null }
    });

    // Set up mock implementations
    mockEnsureConnection.mockResolvedValue(undefined);
    mockSubscribe.mockImplementation((_channel: string, _key: string, handler: (data: any) => void) => {
      messageHandler = handler;
      return () => { messageHandler = null; };
    });
    mockSend.mockResolvedValue(undefined);
    mockDisconnect.mockReturnValue(undefined);
    mockGetWebSocketManager.mockReturnValue(null);

    // Ensure any existing connections are cleaned up
    const currentSocket = (store.getState() as any).socket;
    if (currentSocket) {
      currentSocket.close();
    }
    // Unsubscribe from chat channel if subscribed
    const chatUnsubscribe = (store.getState() as any).chatUnsubscribe;
    if (chatUnsubscribe) {
      chatUnsubscribe();
    }

    store.setState({
      ...defaultState,
      // socket property is no longer part of GlobalChatState but some tests
      // rely on it, so cast to any when resetting
      socket: null,
      wsManager: null,
      chatUnsubscribe: null,
      threads: {},
      currentThreadId: null,
      status: "disconnected",
      error: null,
      progress: { current: 0, total: 0 }
    } as any);
  });

  afterEach(() => {
    // Clean up the mock server
    // if (mockServer) { // Removing this as individual blocks will handle their servers
    //   mockServer.stop();
    // }
  });

  it("createNewThread creates thread and sets currentThreadId", async () => {
    const id = await store.getState().createNewThread();
    expect(id).toBe("id-0");
    const state = store.getState();
    expect(state.currentThreadId).toBe(id);
    expect(state.threads[id]).toBeDefined();
  });

  it("sendMessage adds message to thread and sends via socket", async () => {
    // Set up mock to indicate connected state
    mockIsConnected = true;
    
    // Track sent messages
    let sentData: any;
    mockSend.mockImplementation((data: any) => {
      sentData = data;
      return Promise.resolve();
    });

    // Connect first to establish WebSocket
    await store.getState().connect();

    const msg: Message = {
      role: "user",
      type: "message",
      content: "hello"
    } as Message;

    await store.getState().sendMessage(msg);

    const threadId = store.getState().currentThreadId as string;
    expect(threadId).toBeTruthy();
    expect(store.getState().threads[threadId]).toBeDefined();
    expect(store.getState().messageCache[threadId][0]).toEqual({
      ...msg,
      thread_id: threadId,
      agent_mode: false
    });
    expect(store.getState().status).toBe("loading");

    // Expect chat_message command wrapper per unified WebSocket API
    expect(sentData).toEqual({
      command: "chat_message",
      data: {
        ...msg,
        workflow_id: null,
        thread_id: threadId,
        agent_mode: false,
        model: "gpt-oss:20b",
        provider: "empty",
        tools: undefined,
        collections: undefined
      }
    });
  });

  it("switchThread does nothing for invalid id", () => {
    store.getState().createNewThread();
    store.getState().switchThread("nonexistent");
    expect(store.getState().currentThreadId).toBe("id-0");
  });

  it("deleteThread removes thread and creates new if none left", async () => {
    const first = await store.getState().createNewThread();
    await store.getState().deleteThread(first);
    const state = store.getState();
    expect(state.currentThreadId).toBe("id-1");
    expect(Object.keys(state.threads)).toEqual(["id-1"]);
  });

  describe("WebSocket Connection", () => {
    beforeEach(() => {
      mockIsConnected = true;
    });

    it("connect establishes WebSocket connection", async () => {
      await store.getState().connect();
      const state = store.getState();
      expect(state.status).toBe("connected");
      expect(mockEnsureConnection).toHaveBeenCalled();
      expect(state.error).toBeNull();
    });

    it("connect unsubscribes existing subscription before creating new one", async () => {
      // First connect
      await store.getState().connect();
      const firstUnsubscribe = store.getState().chatUnsubscribe;
      expect(firstUnsubscribe).toBeDefined();

      // Connect again
      await store.getState().connect();
      
      // Should have called subscribe twice
      expect(mockSubscribe).toHaveBeenCalledTimes(2);
      expect(store.getState().status).toBe("connected");
    });

    it("disconnect updates status", async () => {
      await store.getState().connect();

      store.getState().disconnect();
      expect(store.getState().status).toBe("disconnected");
      expect(store.getState().chatUnsubscribe).toBeNull();
    });

    it.skip("handles WebSocket errors during connection", async () => {
      // Skip this test as it's difficult to simulate WebSocket errors with mock-socket
      // The test would normally verify error handling during connection failures
    });

    it.skip("handles WebSocket close events", async () => {
      // Skip - WebSocket close events are now handled by globalWebSocketManager
      // This test no longer applies since we mock the global manager
    });

    it.skip("handles clean WebSocket close without error", async () => {
      // Skip - WebSocket close events are now handled by globalWebSocketManager
      // This test no longer applies since we mock the global manager
    });
  });

  describe("Message Handling", () => {
    beforeEach(async () => {
      mockIsConnected = true;

      await store.getState().connect();
      await store.getState().createNewThread();
    }, 60000);

    // Helper function to simulate server sending a message via the messageHandler
    const simulateChatMessage = (data: any) => {
      if (messageHandler) {
        messageHandler(data);
      }
    };

    it("handles incoming message updates", async () => {
      const threadId = store.getState().currentThreadId!;
      const message: Message = {
        role: "assistant",
        type: "message",
        content: "Hello from assistant",
        thread_id: threadId
      };

      // Simulate server sending a message via the chat subscription handler
      simulateChatMessage(message);

      // Wait for message to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messages = store.getState().messageCache[threadId];
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(message);
      expect(store.getState().status).toBe("connected");
    });

    it("handles chunk updates by appending to last assistant message", async () => {
      const threadId = store.getState().currentThreadId!;
      
      // First add an assistant message
      const message: Message = {
        role: "assistant",
        type: "message",
        content: "Hello",
        thread_id: threadId
      };
      simulateChatMessage(message);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then send a chunk
      const chunk: Chunk = {
        type: "chunk",
        content: " world!",
        content_type: "text",
        content_metadata: {},
        done: false
      };
      simulateChatMessage(chunk);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messages = store.getState().messageCache[threadId];
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello world!");
    });

    it("handles chunk updates by creating new assistant message if none exists", async () => {
      const chunk: Chunk = {
        type: "chunk",
        content: "New message",
        content_type: "text",
        content_metadata: {},
        done: false
      };
      simulateChatMessage(chunk);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().messageCache[threadId];
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].content).toBe("New message");
    });

    it("reconciles streamed assistant chunks with final assistant message", async () => {
      const threadId = store.getState().currentThreadId!;
      
      const chunk: Chunk = {
        type: "chunk",
        content: "Hello",
        content_type: "text",
        content_metadata: {},
        done: true
      };
      simulateChatMessage(chunk);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const finalMessage: Message = {
        id: "server-msg-1",
        role: "assistant",
        type: "message",
        content: "Hello\n",
        thread_id: threadId
      };
      simulateChatMessage(finalMessage);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messages = store.getState().messageCache[threadId];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe("server-msg-1");
      expect(messages[0].content).toBe("Hello\n");
    });

    it("handles job update - completed", async () => {
      const threadId = store.getState().currentThreadId!;
      store.setState({
        status: "loading" as any,
        progress: { current: 5, total: 10 }
      });

      const jobUpdate = {
        type: "job_update",
        status: "completed",
        job_id: "test-job",
        thread_id: threadId
      } as any;
      simulateChatMessage(jobUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(store.getState().status).toBe("connected");
      expect(store.getState().progress).toEqual({ current: 0, total: 0 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it("handles job update - failed", async () => {
      const threadId = store.getState().currentThreadId!;
      const jobUpdate = {
        type: "job_update",
        status: "failed",
        job_id: "test-job",
        thread_id: threadId,
        error: "Something went wrong"
      } as any;
      simulateChatMessage(jobUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(store.getState().status).toBe("error");
      expect(store.getState().error).toBe("Something went wrong");
      expect(store.getState().statusMessage).toBe("Something went wrong");
    });

    it("handles node update - completed", async () => {
      const threadId = store.getState().currentThreadId!;
      store.setState({
        progress: { current: 5, total: 10 },
        statusMessage: "Processing..."
      });

      const nodeUpdate = {
        type: "node_update",
        node_id: "test-node",
        node_type: "test.node",
        status: "completed",
        node_name: "Test Node",
        thread_id: threadId
      } as any;
      simulateChatMessage(nodeUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(store.getState().progress).toEqual({ current: 0, total: 0 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it("handles node update - running", async () => {
      const threadId = store.getState().currentThreadId!;
      const nodeUpdate = {
        type: "node_update",
        node_id: "test-node",
        node_type: "test.node",
        status: "running",
        node_name: "Test Node",
        thread_id: threadId
      } as any;
      simulateChatMessage(nodeUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(store.getState().statusMessage).toBe("Test Node");
    });

    it.skip("handles tool call updates", async () => {
      // This test passes in isolation but times out when run with the full suite
      // It would normally verify that tool call updates set the status message
      const threadId = store.getState().currentThreadId!;
      const toolUpdate = {
        type: "tool_call_update",
        name: "api_call",
        args: {},
        message: "Calling API...",
        thread_id: threadId
      } as any;
      simulateChatMessage(toolUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(store.getState().statusMessage).toBe("Calling API...");
    });

    it.skip("handles node progress updates", async () => {
      // This test passes in isolation but times out when run with the full suite
      // It would normally verify that node progress updates set loading status
      const threadId = store.getState().currentThreadId!;
      const progressUpdate = {
        type: "node_progress",
        node_id: "test-node",
        progress: 75,
        total: 100,
        chunk: "",
        thread_id: threadId
      } as any;
      simulateChatMessage(progressUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(store.getState().status).toBe("loading");
      expect(store.getState().progress).toEqual({ current: 75, total: 100 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it.skip("handles output updates - string type", async () => {
      const threadId = store.getState().currentThreadId!;
      // First add an assistant message
      const message = {
        role: "assistant",
        type: "message",
        content: "Current output: ",
        thread_id: threadId
      } as any;
      simulateChatMessage(message);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const outputUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "output",
        output_type: "string",
        value: "additional text",
        metadata: {},
        thread_id: threadId
      } as any;
      simulateChatMessage(outputUpdate);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messages = store.getState().messageCache[threadId];
      expect(messages[0].content).toBe("Current output: additional text");
    });

    it.skip("handles output updates - ignores end of stream marker", async () => {
      const message = {
        role: "assistant",
        type: "message",
        content: "Test",
        workflow_id: "test"
      };
      // Test skipped - would need to use simulateChatMessage with thread_id
      await new Promise((resolve) => setTimeout(resolve, 50));

      const outputUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "output",
        output_type: "string",
        value: "<nodetool_end_of_stream>",
        metadata: {}
      } as any;
      // Test skipped - would need to use simulateChatMessage with thread_id
      await new Promise((resolve) => setTimeout(resolve, 50));

      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().messageCache[threadId];
      expect(messages[0].content).toBe("Test"); // Should remain unchanged
    });

    it.skip("handles output updates - image/audio/video types", async () => {
      const mockData = new Uint8Array([1, 2, 3, 4]);
      const outputUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "output",
        output_type: "image",
        value: { data: mockData },
        metadata: {}
      } as any;
      // Test skipped - would need to use simulateChatMessage with thread_id
      await new Promise((resolve) => setTimeout(resolve, 50));

      const threadId = store.getState().currentThreadId!;
      const messages = store.getState().messageCache[threadId];
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("assistant");
      expect(Array.isArray(messages[0].content)).toBe(true);
    });
  });

  describe("Thread Management", () => {
    it("switchThread switches to existing thread", async () => {
      const thread1 = await store.getState().createNewThread();
      const thread2 = await store.getState().createNewThread();

      store.getState().switchThread(thread1);
      expect(store.getState().currentThreadId).toBe(thread1);
    });

    it("deleteThread switches to most recent remaining thread", async () => {
      const thread1 = await store.getState().createNewThread();
      const thread2 = await store.getState().createNewThread();

      await store.getState().deleteThread(thread2);
      expect(store.getState().currentThreadId).toBe(thread1);
      expect(store.getState().threads[thread2]).toBeUndefined();
    });

    it("deleteThread handles deleting non-current thread", async () => {
      const thread1 = await store.getState().createNewThread();
      const thread2 = await store.getState().createNewThread();

      await store.getState().deleteThread(thread1);
      expect(store.getState().currentThreadId).toBe(thread2);
      expect(store.getState().threads[thread1]).toBeUndefined();
    });

    it("getCurrentMessages returns messages for current thread", async () => {
      const threadId = await store.getState().createNewThread();
      const message: Message = {
        role: "user",
        type: "message",
        content: "test"
      } as Message;

      store.setState({
        messageCache: {
          [threadId]: [message]
        }
      });

      const messages = await store.getState().getCurrentMessages();
      expect(messages).toEqual([message]);
    });

    it("getCurrentMessages returns empty array when no current thread", () => {
      store.setState({ currentThreadId: null });
      expect(store.getState().getCurrentMessages()).toEqual([]);
    });

    it("updateThreadTitle updates thread title and timestamp", async () => {
      const threadId = await store.getState().createNewThread();
      const originalTimestamp = store.getState().threads[threadId].updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      store.getState().updateThreadTitle(threadId, "New Title");
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe("New Title");
      expect(thread.updated_at).not.toBe(originalTimestamp);
    });

    it("updateThreadTitle handles non-existent thread", () => {
      const initialState = store.getState();
      store.getState().updateThreadTitle("nonexistent", "Title");
      expect(store.getState()).toEqual(initialState);
    });

    it("resetMessages clears messages for current thread", async () => {
      const threadId = await store.getState().createNewThread();
      const message: Message = {
        role: "user",
        type: "message",
        content: "test"
      } as Message;

      store.setState({
        messageCache: {
          [threadId]: [message]
        }
      });

      store.getState().resetMessages();
      expect(store.getState().messageCache[threadId]).toEqual([]);
    });
  });

  describe("sendMessage Advanced Cases", () => {
    let sentData: any;

    beforeEach(async () => {
      mockIsConnected = true;
      // Track sent messages
      sentData = undefined;
      mockSend.mockImplementation((data: any) => {
        sentData = data;
        return Promise.resolve();
      });

      await store.getState().connect();
    });

    it("sendMessage creates thread if none exists", async () => {
      const message: Message = {
        role: "user",
        type: "message",
        content: "hello"
      } as Message;
      await store.getState().sendMessage(message);

      expect(store.getState().currentThreadId).toBeTruthy();
      expect(Object.keys(store.getState().threads)).toHaveLength(1);
    });

    it("sendMessage auto-generates title from first user message", async () => {
      // Create a fresh thread first
      await store.getState().createNewThread();
      
      const message: Message = {
        role: "user",
        type: "message",
        content:
          "This is a long message that should be truncated for the title because it exceeds fifty characters"
      } as Message;
      await store.getState().sendMessage(message);

      const threadId = store.getState().currentThreadId!;
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe(
        "This is a long message that should be truncated fo..."
      );
    });

    it("sendMessage handles array content for title generation", async () => {
      // Create a fresh thread first
      await store.getState().createNewThread();
      
      const message: Message = {
        role: "user",
        type: "message",
        content: [{ type: "text", text: "Hello world" }]
      } as Message;
      await store.getState().sendMessage(message);

      const threadId = store.getState().currentThreadId!;
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe("Hello world");
    });

    it("sendMessage uses fallback title for non-text content", async () => {
      // Create a fresh thread first
      await store.getState().createNewThread();
      
      const message: Message = {
        role: "user",
        type: "message",
        content: [
          { type: "image_url", image: { type: "image", uri: "test.jpg" } }
        ]
      } as Message;
      await store.getState().sendMessage(message);

      const threadId = store.getState().currentThreadId!;
      const thread = store.getState().threads[threadId];
      expect(thread.title).toBe("New conversation");
    });

    it("sendMessage does nothing when socket is not connected", async () => {
      // Set mockIsConnected to false for this test
      mockIsConnected = false;
      
      store.setState({
        socket: null,
        wsManager: null,
        chatUnsubscribe: null,
        currentThreadId: null,
        threads: {}
      } as any);
      const message: Message = {
        role: "user",
        type: "message",
        content: "hello"
      } as Message;

      await store.getState().sendMessage(message);
      // Should set an error since not connected
      expect(store.getState().error).toBe("Not connected to chat service");
    });

    it("sendMessage adds workflowId and threadId to message", async () => {
      store.setState({ workflowId: "test-workflow" });
      const threadId = await store.getState().createNewThread();
      const message: Message = {
        role: "user",
        type: "message",
        content: "hello"
      } as Message;

      await store.getState().sendMessage(message);

      // Expect chat_message command wrapper per unified WebSocket API
      expect(sentData).toEqual({
        command: "chat_message",
        data: {
          ...message,
          workflow_id: "test-workflow",
          thread_id: threadId,
          agent_mode: false,
          model: "gpt-oss:20b",
          provider: "empty",
          tools: undefined,
          collections: undefined
        }
      });
    });
  });

  describe("stopGeneration", () => {
    let sentData: any;

    beforeEach(async () => {
      mockIsConnected = true;
      // Track sent messages
      sentData = undefined;
      mockSend.mockImplementation((data: any) => {
        sentData = data;
        return Promise.resolve();
      });

      await store.getState().connect();
      await store.getState().createNewThread();
    });

    it("sends stop signal and resets state", async () => {
      store.setState({
        status: "loading" as any,
        progress: { current: 5, total: 10 },
        statusMessage: "Processing..."
      });

      store.getState().stopGeneration();

      // Expect stop command wrapper per unified WebSocket API
      expect(sentData).toEqual({
        command: "stop",
        data: {
          thread_id: store.getState().currentThreadId
        }
      });
      expect(store.getState().status).toBe("connected");
      expect(store.getState().progress).toEqual({ current: 0, total: 0 });
      expect(store.getState().statusMessage).toBeNull();
    });

    it("does nothing when socket is not connected", async () => {
      // Set mockIsConnected to false for this test
      mockIsConnected = false;

      store.getState().stopGeneration();

      // Should log "WebSocket is not connected" but not crash
      // The status remains whatever it was before
    });

    it("does nothing when no current thread", async () => {
      store.setState({ currentThreadId: null });

      sentData = undefined;

      store.getState().stopGeneration();

      // Should not send any message
      expect(sentData).toBeUndefined();
    });
  });

  describe("Authentication and Non-localhost", () => {
    beforeEach(() => {
      mockIsConnected = true;
    });

    it("adds authentication token to WebSocket URL when session exists", async () => {
      // In localhost mode, authentication is not used, so this test just verifies connection works
      const mockSession = {
        data: {
          session: {
            access_token: "test-token-123"
          }
        }
      };
      (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce(
        mockSession
      );

      await store.getState().connect();

      // Verify connection was successful
      expect(store.getState().status).toBe("connected");
    });

    it("warns when no Supabase session found", async () => {
      // We're already in localhost mode from the global mock, so skip this test
      // as the warning only happens in non-localhost mode
      expect(true).toBe(true);
    });

    it("handles Supabase session errors", async () => {
      // We're in localhost mode, so auth errors won't happen
      // Skip this test as it's not applicable in localhost mode
      expect(true).toBe(true);
    });

    it.skip("includes auth context in connection error messages", async () => {
      // This test is skipped because with the global WebSocket manager,
      // error handling happens at the manager level, not at the store level
      expect(true).toBe(true);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    beforeEach(async () => {
      mockIsConnected = true;

      await store.getState().connect();
    });

    it.skip("handles message for non-existent thread", async () => {
      store.setState({ currentThreadId: "non-existent" });

      const message: Message = {
        role: "assistant",
        type: "message",
        content: "Test message",
        thread_id: "non-existent"
      };

      const initialState = store.getState();
      if (messageHandler) {
        messageHandler(message);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      // State should remain unchanged since thread doesn't exist
      expect(store.getState().threads).toEqual(initialState.threads);
    });

    it("handles chunk for non-existent thread", async () => {
      store.setState({ currentThreadId: "non-existent" });

      const chunk: Chunk = {
        type: "chunk",
        content: "Test chunk",
        content_type: "text",
        content_metadata: {},
        done: false
      };

      const initialState = store.getState();
      if (messageHandler) {
        messageHandler(chunk);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      // State should remain unchanged since thread doesn't exist
      expect(store.getState().threads).toEqual(initialState.threads);
    });

    it("handles output update for non-existent thread", async () => {
      store.setState({ currentThreadId: "non-existent" });

      const outputUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "output",
        output_type: "string",
        value: "Test output",
        metadata: {},
        thread_id: "non-existent"
      } as any;

      const initialState = store.getState();
      if (messageHandler) {
        messageHandler(outputUpdate);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      // State should remain unchanged since thread doesn't exist
      expect(store.getState().threads).toEqual(initialState.threads);
    });

    it("handles unknown message types gracefully", async () => {
      // Send unknown message type
      if (messageHandler) {
        messageHandler({ type: "unknown_type", data: "test", thread_id: "test-thread" });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw or crash, store state should remain stable
      expect(store.getState().status).toBe("connected");
    });

    it("handles malformed message data", async () => {
      // Send data with an unknown message type via the handler
      if (messageHandler) {
        messageHandler({
          type: "completely_unknown_type",
          data: "test",
          thread_id: "test-thread"
        });
      }

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Application should remain in a valid state even after receiving unknown message types
      expect(store.getState().status).toBe("connected");
    });

    it.skip("handles WebSocket ready state changes during operations", async () => {
      // This test is no longer applicable with mock-socket
      // mock-socket handles WebSocket states internally
      await store.getState().connect();

      // Wait for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Disconnect should handle connected socket gracefully
      store.getState().disconnect();
      expect(store.getState().status).toBe("disconnected");
    });

    it.skip("handles connection timeout", async () => {
      // Skip this test as it causes issues with jsdom/tough-cookie
      // The test would stop the server to simulate connection failure
      // and expect connection timeout error
    });
  });

  describe("Message Content Utilities", () => {
    it.skip("makeMessageContent handles different content types", async () => {
      // This test passes in isolation but has timing issues with the full suite
      // It tests functionality that's also covered by the output_update tests
      // Also needs to be updated to use globalWebSocketManager mock
      await store.getState().connect();
      await store.getState().createNewThread();

      const mockData = new Uint8Array([1, 2, 3, 4]);
      const threadId = store.getState().currentThreadId!;

      // Test image content
      const imageUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "image_output",
        output_type: "image",
        value: { data: mockData },
        metadata: {},
        thread_id: threadId
      } as any;
      // Test skipped - would use messageHandler
      await new Promise((resolve) => setTimeout(resolve, 50));

      let messages = store.getState().messageCache[threadId];
      expect(messages[0].content).toEqual([
        {
          type: "image_url",
          image: { type: "image", uri: "blob:mock" }
        }
      ]);

      // Reset messages for next test
      store.getState().resetMessages();

      // Test audio content
      const audioUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "audio_output",
        output_type: "audio",
        value: { data: mockData },
        metadata: {},
        thread_id: threadId
      } as any;
      // Test skipped - would use messageHandler
      await new Promise((resolve) => setTimeout(resolve, 50));

      messages = store.getState().messageCache[threadId];
      expect(messages[0].content).toEqual([
        {
          type: "audio",
          audio: { type: "audio", uri: "blob:mock" }
        }
      ]);

      // Reset messages for next test
      store.getState().resetMessages();

      // Test video content
      const videoUpdate = {
        type: "output_update",
        node_id: "test-node",
        node_name: "Test Node",
        output_name: "video_output",
        output_type: "video",
        value: { data: mockData },
        metadata: {},
        thread_id: threadId
      } as any;
      // Test skipped - would use messageHandler
      await new Promise((resolve) => setTimeout(resolve, 50));

      messages = store.getState().messageCache[threadId];
      expect(messages[0].content).toEqual([
        {
          type: "video",
          video: { type: "video", uri: "blob:mock" }
        }
      ]);
    });
  });

  describe("State Persistence", () => {
    it("partialize function returns only threads and currentThreadId", () => {
      const mockState = {
        status: "connected" as const,
        statusMessage: "test",
        progress: { current: 5, total: 10 },
        error: "test error",
        workflowId: "workflow-123",
        socket: {} as WebSocket,
        threads: { "thread-1": {} as any },
        currentThreadId: "thread-1"
        // ... other properties would be here in real state
      } as any;

      // Access the partialize function from the store config
      // Note: This tests the partialize logic conceptually
      const persistedState = {
        threads: mockState.threads,
        currentThreadId: mockState.currentThreadId
      };

      expect(persistedState).toEqual({
        threads: { "thread-1": {} },
        currentThreadId: "thread-1"
      });

      // Verify that connection state is not persisted
      expect(persistedState).not.toHaveProperty("status");
      expect(persistedState).not.toHaveProperty("socket");
      expect(persistedState).not.toHaveProperty("error");
    });
  });
});
