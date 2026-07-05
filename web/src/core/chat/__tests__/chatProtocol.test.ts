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

  it("applies chunks using chunk.thread_id when currentThreadId points to a different thread", async () => {
    let capturedState: any = {
      status: "connected",
      currentThreadId: "thread-current",
      threads: {
        "thread-current": {
          id: "thread-current",
          title: "Current",
          updated_at: new Date().toISOString()
        },
        "thread-stream": {
          id: "thread-stream",
          title: undefined,
          updated_at: new Date().toISOString()
        }
      },
      messageCache: {
        "thread-current": [
          { role: "user", type: "message", content: "Current thread" }
        ],
        "thread-stream": [
          { role: "user", type: "message", content: "Hello stream" }
        ]
      },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    };

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(typeof updater === "function" ? updater(capturedState) : updater)
      };
    });

    const get = () => capturedState;

    await handleChatWebSocketMessage(
      {
        type: "chunk",
        thread_id: "thread-stream",
        content: "Hi from stream",
        done: true
      } as any,
      set,
      get
    );

    expect(capturedState.messageCache["thread-stream"]).toEqual([
      { role: "user", type: "message", content: "Hello stream" },
      expect.objectContaining({
        role: "assistant",
        type: "message",
        content: "Hi from stream"
      })
    ]);
    expect(capturedState.messageCache["thread-current"]).toEqual([
      { role: "user", type: "message", content: "Current thread" }
    ]);
    expect(capturedState.updateThreadTitle).toHaveBeenCalledWith(
      "thread-stream",
      "Hello stream"
    );
  });

  it("resets loading status when a non-stream assistant message arrives", async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    const timeoutId = setTimeout(() => undefined, 5000);
    let capturedState: any = {
      status: "loading",
      currentThreadId: "thread-1",
      threadRuntime: {
        "thread-1": {
          status: "loading",
          statusMessage: "Thinking...",
          progress: { current: 1, total: 2 },
          error: null,
          planningUpdate: { planning_status: "in_progress" },
          taskUpdate: { execution_status: "running" },
          logUpdate: { message: "step started" },
          runningToolCallId: null,
          toolMessage: null,
          sendMessageTimeoutId: timeoutId
        }
      },
      progress: { current: 1, total: 2 },
      statusMessage: "Thinking...",
      currentPlanningUpdate: { planning_status: "in_progress" },
      currentTaskUpdate: { execution_status: "running" },
      currentTaskUpdateThreadId: "thread-1",
      currentLogUpdate: { message: "step started" },
      threads: {
        "thread-1": {
          id: "thread-1",
          title: undefined,
          updated_at: new Date().toISOString()
        }
      },
      messageCache: {
        "thread-1": [{ role: "user", type: "message", content: "Hello" }]
      },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    };

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(typeof updater === "function" ? updater(capturedState) : updater)
      };
    });

    const get = () => capturedState;

    await handleChatWebSocketMessage(
      {
        type: "message",
        role: "assistant",
        thread_id: "thread-1",
        content: "Hi there!"
      } as any,
      set,
      get
    );

    expect(capturedState.status).toBe("connected");
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutId);
    expect(
      capturedState.threadRuntime["thread-1"].sendMessageTimeoutId
    ).toBeNull();
    expect(capturedState.threadRuntime["thread-1"].status).toBe("idle");
    expect(capturedState.progress).toEqual({ current: 0, total: 0 });
    expect(capturedState.statusMessage).toBeNull();
    expect(capturedState.currentPlanningUpdate).toBeNull();
    expect(capturedState.currentTaskUpdate).toBeNull();
    expect(capturedState.currentTaskUpdateThreadId).toBeNull();
    expect(capturedState.currentLogUpdate).toBeNull();
    expect(capturedState.messageCache["thread-1"]).toHaveLength(2);

    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it("replaces the streaming placeholder when an assistant tool_call message carries the same text", async () => {
    // Reproduces the duplicate-message bug: while streaming, applyChunk builds a
    // local-stream-* placeholder from the text. The server then re-sends that
    // same text as an assistant message with tool_calls. The placeholder must be
    // replaced — not joined by a second copy of the text.
    let capturedState: any = {
      status: "streaming",
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          title: "T",
          updated_at: new Date().toISOString()
        }
      },
      messageCache: {
        "thread-1": [
          { role: "user", type: "message", content: "Search the web" },
          {
            id: "local-stream-123-abc",
            role: "assistant",
            type: "message",
            content: "Let me search for that."
          }
        ]
      },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    };

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(typeof updater === "function" ? updater(capturedState) : updater)
      };
    });

    const get = () => capturedState;

    await handleChatWebSocketMessage(
      {
        type: "message",
        id: "server-msg-1",
        role: "assistant",
        thread_id: "thread-1",
        created_at: new Date().toISOString(),
        content: "Let me search for that.",
        tool_calls: [{ id: "call-1", name: "web_search", args: {} }]
      } as any,
      set,
      get
    );

    const messages = capturedState.messageCache["thread-1"];
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(
      expect.objectContaining({
        id: "server-msg-1",
        role: "assistant",
        content: "Let me search for that.",
        tool_calls: [{ id: "call-1", name: "web_search", args: {} }]
      })
    );
    // The local streaming id is replaced by the finalized server message.
    expect(messages[1].id).not.toMatch(/^local-stream-/);
  });

  it("does not overwrite an earlier longer placeholder with a short finalized message (multi-tool-round dedup)", async () => {
    // Regression: with two un-finalized local-stream-* placeholders, a short
    // finalized message ("Searching") was matching the older longer placeholder
    // ("Searching the web for results") via candidateNormalized.startsWith(incoming)
    // and overwriting it instead of replacing the correct trailing placeholder.
    let capturedState: any = {
      status: "streaming",
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          title: "T",
          updated_at: new Date().toISOString()
        }
      },
      messageCache: {
        "thread-1": [
          { role: "user", type: "message", content: "Search twice" },
          // Older placeholder from tool round 1 (longer text)
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: "Searching the web for results about your query."
          },
          // Tool result from round 1 (server-authored, should be skipped)
          {
            id: "tool-result-1",
            role: "tool",
            type: "message",
            content: "Found 10 results."
          },
          // Trailing placeholder from tool round 2 (shorter text)
          {
            id: "local-stream-200-bbb",
            role: "assistant",
            type: "message",
            content: "Searching"
          }
        ]
      },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    };

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(typeof updater === "function" ? updater(capturedState) : updater)
      };
    });
    const get = () => capturedState;

    // Server finalizes tool round 2 with "Searching" — must replace local-stream-200-bbb
    await handleChatWebSocketMessage(
      {
        type: "message",
        id: "server-msg-2",
        role: "assistant",
        thread_id: "thread-1",
        created_at: new Date().toISOString(),
        content: "Searching",
        tool_calls: [{ id: "call-2", name: "web_search", args: {} }]
      } as any,
      set,
      get
    );

    const messages = capturedState.messageCache["thread-1"];
    // Still 4 messages — placeholder B replaced, not A
    expect(messages).toHaveLength(4);
    // The older placeholder (A) must remain untouched
    expect(messages[1]).toMatchObject({
      id: "local-stream-100-aaa",
      content: "Searching the web for results about your query."
    });
    // The trailing placeholder (B) must be replaced by the server message
    expect(messages[3]).toMatchObject({
      id: "server-msg-2",
      content: "Searching"
    });
    expect(messages[3].id).not.toMatch(/^local-stream-/);
  });

  it("returns tool errors for unknown client tools", async () => {
    (FrontendToolRegistry.has as jest.Mock).mockReturnValue(false);

    const set = jest.fn();
    const get = () =>
      ({
        status: "connected",
        wsManager: { send: jest.fn() },
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
