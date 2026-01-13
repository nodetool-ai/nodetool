import { handleChatWebSocketMessage } from "../chatProtocol";
import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    has: jest.fn(),
    call: jest.fn()
  }
}));

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: jest.fn().mockResolvedValue(undefined),
    ensureConnection: jest.fn().mockResolvedValue(undefined)
  }
}));

describe("chatProtocol", () => {
  describe("title generation", () => {
    it("generates title from first user message when first assistant chunk completes", async () => {
      let capturedState: any = {
        status: "connected",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": { id: "thread-1", title: undefined, updated_at: new Date().toISOString() }
        },
        messageCache: {
          "thread-1": [
            { role: "user", type: "message", content: "Hello world" }
          ]
        },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      };

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(typeof updater === "function" ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        { type: "chunk", content: "Hi there!", done: true } as any,
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith("thread-1", "Hello world");
    });

    it("does not generate title when thread already has a title", async () => {
      let capturedState: any = {
        status: "connected",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": { id: "thread-1", title: "Existing Title", updated_at: new Date().toISOString() }
        },
        messageCache: {
          "thread-1": [
            { role: "user", type: "message", content: "Hello world" }
          ]
        },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      };

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(typeof updater === "function" ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        { type: "chunk", content: "Hi there!", done: true } as any,
        set,
        get
      );

      expect(capturedState.updateThreadTitle).not.toHaveBeenCalled();
    });

    it("does not generate title for non-first assistant messages", async () => {
      let capturedState: any = {
        status: "connected",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": { id: "thread-1", title: undefined, updated_at: new Date().toISOString() }
        },
        messageCache: {
          "thread-1": [
            { role: "user", type: "message", content: "First question" },
            { role: "assistant", type: "message", content: "First answer" },
            { role: "user", type: "message", content: "Second question" }
          ]
        },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      };

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(typeof updater === "function" ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        { type: "chunk", content: "Second answer", done: true } as any,
        set,
        get
      );

      expect(capturedState.updateThreadTitle).not.toHaveBeenCalled();
    });

    it("handles array content for title generation", async () => {
      let capturedState: any = {
        status: "connected",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": { id: "thread-1", title: undefined, updated_at: new Date().toISOString() }
        },
        messageCache: {
          "thread-1": [
            { role: "user", type: "message", content: [{ type: "text", text: "Hello world" }] }
          ]
        },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      };

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(typeof updater === "function" ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        { type: "chunk", content: "Hi!", done: true } as any,
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith("thread-1", "Hello world");
    });

    it("uses fallback title for non-text content", async () => {
      let capturedState: any = {
        status: "connected",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": { id: "thread-1", title: undefined, updated_at: new Date().toISOString() }
        },
        messageCache: {
          "thread-1": [
            { role: "user", type: "message", content: [{ type: "image_url", image: { type: "image", uri: "test.jpg" } }] }
          ]
        },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      };

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(typeof updater === "function" ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        { type: "chunk", content: "Hi!", done: true } as any,
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith("thread-1", "New conversation");
    });

    it("truncates long titles to 50 characters", async () => {
      let capturedState: any = {
        status: "connected",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": { id: "thread-1", title: undefined, updated_at: new Date().toISOString() }
        },
        messageCache: {
          "thread-1": [
            { role: "user", type: "message", content: "This is a very long message that should definitely be truncated because it exceeds fifty characters" }
          ]
        },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      };

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(typeof updater === "function" ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        { type: "chunk", content: "Hi!", done: true } as any,
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith(
        "thread-1",
        "This is a very long message that should definitely..."
      );
    });
  });

  it("ignores non-critical messages while stopping", async () => {
    const set = jest.fn();
    const get = () =>
      ({
        status: "stopping"
      }) as any;

    await handleChatWebSocketMessage({ type: "chunk", content: "hi" } as any, set, get);

    expect(set).not.toHaveBeenCalled();
  });

  it("returns tool errors for unknown client tools", async () => {
    (FrontendToolRegistry.has as jest.Mock).mockReturnValue(false);

    const set = jest.fn();
    const get = () =>
      ({
        status: "connected",
        wsManager: { send: jest.fn() },
        frontendToolState: {},
        currentThreadId: null,
        threads: {},
        messageCache: {},
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn()
      }) as any;

    await handleChatWebSocketMessage(
      {
        type: "tool_call",
        tool_call_id: "tc1",
        name: "unknown_tool",
        args: {},
        thread_id: "thread-1"
      } as any,
      set,
      get
    );

    expect(globalWebSocketManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        ok: false
      })
    );
  });

  it("returns structured tool_result on tool failure", async () => {
    (FrontendToolRegistry.has as jest.Mock).mockReturnValue(true);
    (FrontendToolRegistry.call as jest.Mock).mockRejectedValue(new Error("nope"));

    const set = jest.fn();
    const get = () =>
      ({
        status: "connected",
        wsManager: { send: jest.fn() },
        workflowId: null,
        threadWorkflowId: {},
        frontendToolState: { fetchWorkflow: jest.fn().mockResolvedValue(undefined) },
        currentThreadId: null,
        threads: {},
        messageCache: {},
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn()
      }) as any;

    await handleChatWebSocketMessage(
      {
        type: "tool_call",
        tool_call_id: "tc_fail",
        name: "ui_fail",
        args: {},
        thread_id: "thread-1"
      } as any,
      set,
      get
    );

    expect(globalWebSocketManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        tool_call_id: "tc_fail",
        ok: false,
        error: "nope",
        result: { error: "nope" }
      })
    );
  });
});
