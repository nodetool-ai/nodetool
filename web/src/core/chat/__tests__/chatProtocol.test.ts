import { handleChatWebSocketMessage } from "../chatProtocol";
import { stub } from "../../../test-utils/doubles";
import type { WebSocketMessage } from "../../../lib/websocket/GlobalWebSocketManager";
import type { GlobalChatState } from "../../../stores/GlobalChatStore";
import type { Message } from "../../../stores/ApiTypes";

/**
 * Each case stands up only the slice of GlobalChatState its reducer reads; the
 * full state is ~70 fields wide. Reads off the result stay type-checked.
 */
const partialChatState = (state: unknown): GlobalChatState =>
  state as GlobalChatState;

/** A zustand `set` argument given as an updater rather than a partial state. */
const isStateUpdater = (
  value: unknown
): value is (state: GlobalChatState) => Partial<GlobalChatState> =>
  typeof value === "function";
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
  describe("agent turn status", () => {
    const makeState = (threadRuntimeStatus: string): GlobalChatState =>
      partialChatState({
      status: "streaming",
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          title: "T",
          updated_at: new Date().toISOString()
        }
      },
      threadRuntime: {
        "thread-1": {
          status: threadRuntimeStatus,
          statusMessage: null,
          progress: { current: 0, total: 0 },
          error: null,
          planningUpdate: null,
          taskUpdate: null,
          logUpdate: null,
          runningToolCallId: null,
          toolMessage: null,
          sendMessageTimeoutId: null
        }
      },
      messageCache: { "thread-1": [{ role: "user", type: "message", content: "go" }] },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    });

    // An assistant message carrying tool_calls is mid-loop by definition: the
    // model asked for tools, so the turn continues. Resetting to idle here is
    // what flips the composer back to Run while tools are still running.
    it("stays busy on an assistant message that requests tool calls", async () => {
      let capturedState: GlobalChatState = makeState("streaming");
      const set = jest.fn((updater) => {
        capturedState = {
          ...capturedState,
          ...(isStateUpdater(updater) ? updater(capturedState) : updater)
        };
      });

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({
          type: "message",
          role: "assistant",
          thread_id: "thread-1",
          content: null,
          tool_calls: [{ id: "c1", name: "ui_sketch_get_state", args: {} }]
        }),
        set,
        () => capturedState
      );

      expect(capturedState.threadRuntime["thread-1"].status).not.toBe("idle");
    });

    it("goes idle on a final assistant message with no tool calls", async () => {
      let capturedState: GlobalChatState = makeState("streaming");
      const set = jest.fn((updater) => {
        capturedState = {
          ...capturedState,
          ...(isStateUpdater(updater) ? updater(capturedState) : updater)
        };
      });

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({
          type: "message",
          role: "assistant",
          thread_id: "thread-1",
          content: "All done."
        }),
        set,
        () => capturedState
      );

      expect(capturedState.threadRuntime["thread-1"].status).toBe("idle");
    });
  });

  // The task planner and the headless graph author forward progress as bare
  // planning_update events, not agent_execution messages. Without a dispatch
  // branch they were dropped and the user saw a silent "Thinking…".
  describe("planner progress events", () => {
    const makeState = (): GlobalChatState =>
      partialChatState({
      status: "streaming",
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          title: "T",
          updated_at: new Date().toISOString()
        }
      },
      threadRuntime: {
        "thread-1": {
          status: "streaming",
          statusMessage: null,
          progress: { current: 0, total: 0 },
          error: null,
          planningUpdate: null,
          taskUpdate: null,
          logUpdate: null,
          runningToolCallId: null,
          toolMessage: null,
          sendMessageTimeoutId: null
        }
      },
      lastTaskUpdatesByThread: {},
      messageCache: { "thread-1": [] },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    });

    const dispatch = async (payload: WebSocketMessage) => {
      let capturedState: GlobalChatState = makeState();
      const set = jest.fn((updater) => {
        capturedState = {
          ...capturedState,
          ...(isStateUpdater(updater) ? updater(capturedState) : updater)
        };
      });
      await handleChatWebSocketMessage(payload, set, () => capturedState);
      return capturedState;
    };

    it("routes planning_update to the thread runtime", async () => {
      const state = await dispatch({
        type: "planning_update",
        thread_id: "thread-1",
        phase: "generation",
        status: "running",
        content: "Writing orchestration script..."
      });

      expect(state.threadRuntime["thread-1"].planningUpdate).toMatchObject({
        phase: "generation",
        content: "Writing orchestration script..."
      });
    });

    it("routes log_update to the thread runtime", async () => {
      const state = await dispatch({
        type: "log_update",
        thread_id: "thread-1",
        content: "Executing orchestration script...",
        severity: "info"
      });

      expect(state.threadRuntime["thread-1"].logUpdate).toMatchObject({
        content: "Executing orchestration script..."
      });
    });

    it("routes task_update to the thread runtime and the last-update map", async () => {
      const state = await dispatch({
        type: "task_update",
        thread_id: "thread-1",
        event: "task_created",
        task: { id: "t1", title: "Research", steps: [] }
      });

      expect(state.threadRuntime["thread-1"].taskUpdate).toMatchObject({
        event: "task_created"
      });
      expect(state.lastTaskUpdatesByThread["thread-1"]).toMatchObject({
        event: "task_created"
      });
    });
  });

  describe("title generation", () => {
    it("generates title from first user message when first assistant chunk completes", async () => {
      let capturedState: GlobalChatState = partialChatState({
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
      });

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(isStateUpdater(updater) ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({ type: "chunk", content: "Hi there!", done: true }),
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith("thread-1", "Hello world");
    });

    it("does not generate title when thread already has a title", async () => {
      let capturedState: GlobalChatState = partialChatState({
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
      });

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(isStateUpdater(updater) ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({ type: "chunk", content: "Hi there!", done: true }),
        set,
        get
      );

      expect(capturedState.updateThreadTitle).not.toHaveBeenCalled();
    });

    it("does not generate title for non-first assistant messages", async () => {
      let capturedState: GlobalChatState = partialChatState({
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
      });

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(isStateUpdater(updater) ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({ type: "chunk", content: "Second answer", done: true }),
        set,
        get
      );

      expect(capturedState.updateThreadTitle).not.toHaveBeenCalled();
    });

    it("handles array content for title generation", async () => {
      let capturedState: GlobalChatState = partialChatState({
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
      });

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(isStateUpdater(updater) ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({ type: "chunk", content: "Hi!", done: true }),
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith("thread-1", "Hello world");
    });

    it("uses fallback title for non-text content", async () => {
      let capturedState: GlobalChatState = partialChatState({
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
      });

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(isStateUpdater(updater) ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({ type: "chunk", content: "Hi!", done: true }),
        set,
        get
      );

      expect(capturedState.updateThreadTitle).toHaveBeenCalledWith("thread-1", "New conversation");
    });

    it("truncates long titles to 50 characters", async () => {
      let capturedState: GlobalChatState = partialChatState({
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
      });

      const set = jest.fn((updater) => {
        capturedState = { ...capturedState, ...(isStateUpdater(updater) ? updater(capturedState) : updater) };
      });

      const get = () => capturedState;

      await handleChatWebSocketMessage(
        stub<WebSocketMessage>({ type: "chunk", content: "Hi!", done: true }),
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
      stub<GlobalChatState>({
        status: "stopping"
      });

    await handleChatWebSocketMessage(stub<WebSocketMessage>({ type: "chunk", content: "hi" }), set, get);

    expect(set).not.toHaveBeenCalled();
  });

  it("applies chunks using chunk.thread_id when currentThreadId points to a different thread", async () => {
    let capturedState: GlobalChatState = partialChatState({
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
    });

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(isStateUpdater(updater) ? updater(capturedState) : updater)
      };
    });

    const get = () => capturedState;

    await handleChatWebSocketMessage(
      stub<WebSocketMessage>({
        type: "chunk",
        thread_id: "thread-stream",
        content: "Hi from stream",
        done: true
      }),
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
    let capturedState: GlobalChatState = partialChatState({
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
    });

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(isStateUpdater(updater) ? updater(capturedState) : updater)
      };
    });

    const get = () => capturedState;

    await handleChatWebSocketMessage(
      stub<WebSocketMessage>({
        type: "message",
        role: "assistant",
        thread_id: "thread-1",
        content: "Hi there!"
      }),
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
    let capturedState: GlobalChatState = partialChatState({
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
    });

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(isStateUpdater(updater) ? updater(capturedState) : updater)
      };
    });

    const get = () => capturedState;

    await handleChatWebSocketMessage(
      stub<WebSocketMessage>({
        type: "message",
        id: "server-msg-1",
        role: "assistant",
        thread_id: "thread-1",
        created_at: new Date().toISOString(),
        content: "Let me search for that.",
        tool_calls: [{ id: "call-1", name: "web_search", args: {} }]
      }),
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
    let capturedState: GlobalChatState = partialChatState({
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
    });

    const set = jest.fn((updater) => {
      capturedState = {
        ...capturedState,
        ...(isStateUpdater(updater) ? updater(capturedState) : updater)
      };
    });
    const get = () => capturedState;

    // Server finalizes tool round 2 with "Searching" — must replace local-stream-200-bbb
    await handleChatWebSocketMessage(
      stub<WebSocketMessage>({
        type: "message",
        id: "server-msg-2",
        role: "assistant",
        thread_id: "thread-1",
        created_at: new Date().toISOString(),
        content: "Searching",
        tool_calls: [{ id: "call-2", name: "web_search", args: {} }]
      }),
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

  // The two cases above pin the happy path of the streaming-placeholder
  // reconciliation. These pin the rest of it: which candidates count as a
  // placeholder, and when a placeholder is left alone.
  describe("streaming placeholder reconciliation", () => {
    const stateWith = (messages: unknown[]): GlobalChatState =>
      partialChatState({
        status: "streaming",
        currentThreadId: "thread-1",
        threads: {
          "thread-1": {
            id: "thread-1",
            title: "T",
            updated_at: new Date().toISOString()
          }
        },
        messageCache: { "thread-1": messages },
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn(),
        updateThreadTitle: jest.fn()
      });

    /** Feed one finalized assistant tool_call message and return the cache. */
    const finalize = async (
      messages: unknown[],
      content: string | null
    ): Promise<Message[]> => {
      let capturedState = stateWith(messages);
      const set = jest.fn((updater) => {
        capturedState = {
          ...capturedState,
          ...(isStateUpdater(updater) ? updater(capturedState) : updater)
        };
      });
      await handleChatWebSocketMessage(
        {
          type: "message",
          id: "server-msg",
          role: "assistant",
          thread_id: "thread-1",
          created_at: new Date().toISOString(),
          content,
          tool_calls: [{ id: "call-1", name: "web_search", args: {} }]
        } as unknown as WebSocketMessage,
        set,
        () => capturedState
      );
      return capturedState.messageCache["thread-1"];
    };

    it("appends when the thread holds no assistant message", async () => {
      const messages = await finalize(
        [{ role: "user", type: "message", content: "Search" }],
        "Searching"
      );
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({ id: "server-msg" });
    });

    it("scans past a server-authored assistant message to the placeholder behind it", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: "Searching"
          },
          {
            id: "server-earlier",
            role: "assistant",
            type: "message",
            created_at: new Date().toISOString(),
            content: "Earlier finalized reply."
          }
        ],
        "Searching"
      );
      // Three, not four: the placeholder at index 1 was replaced in place.
      expect(messages).toHaveLength(3);
      expect(messages[1]).toMatchObject({ id: "server-msg" });
      expect(messages[2]).toMatchObject({ id: "server-earlier" });
    });

    it("treats an assistant message with no id and no created_at as a placeholder", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          { role: "assistant", type: "message", content: "Searching" }
        ],
        "Searching"
      );
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({ id: "server-msg" });
    });

    it("replaces the placeholder when the finalized text extends the streamed prefix", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: "Search"
          }
        ],
        "Searching the web."
      );
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        id: "server-msg",
        content: "Searching the web."
      });
    });

    it("appends when the finalized text does not extend the placeholder", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: "Let me think about it."
          }
        ],
        "Searching the web."
      );
      expect(messages).toHaveLength(3);
      expect(messages[1]).toMatchObject({ id: "local-stream-100-aaa" });
      expect(messages[2]).toMatchObject({ id: "server-msg" });
    });

    // A tool-call-only message carries no text, so there is nothing to match a
    // placeholder against — the streamed text has to survive beside it.
    it("appends a tool-call-only message rather than replacing the placeholder", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: "Let me search."
          }
        ],
        null
      );
      expect(messages).toHaveLength(3);
      expect(messages[1]).toMatchObject({ id: "local-stream-100-aaa" });
    });

    it("appends when the placeholder holds no text", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: ""
          }
        ],
        "Searching"
      );
      expect(messages).toHaveLength(3);
      expect(messages[1]).toMatchObject({ id: "local-stream-100-aaa" });
    });

    it("matches placeholder text held as content blocks", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "message",
            content: [
              { type: "text", text: "Search" },
              { type: "text", text: "ing" }
            ]
          }
        ],
        "Searching"
      );
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({ id: "server-msg" });
    });

    it("ignores an assistant entry that is not a plain message", async () => {
      const messages = await finalize(
        [
          { role: "user", type: "message", content: "Search" },
          {
            id: "local-stream-100-aaa",
            role: "assistant",
            type: "tool_call",
            content: "Searching"
          }
        ],
        "Searching"
      );
      expect(messages).toHaveLength(3);
      expect(messages[2]).toMatchObject({ id: "server-msg" });
    });
  });

  it("returns tool errors for unknown client tools", async () => {
    jest.mocked(FrontendToolRegistry.has).mockReturnValue(false);

    const set = jest.fn();
    const get = () =>
      stub<GlobalChatState>({
        status: "connected",
        currentThreadId: null,
        threads: {},
        messageCache: {},
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn()
      });

    await handleChatWebSocketMessage(
      stub<WebSocketMessage>({
        type: "tool_call",
        tool_call_id: "tc1",
        name: "unknown_tool",
        args: {},
        thread_id: "thread-1"
      }),
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
    jest.mocked(FrontendToolRegistry.has).mockReturnValue(true);
    jest.mocked(FrontendToolRegistry.call).mockRejectedValue(new Error("nope"));

    const set = jest.fn();
    const get = () =>
      stub<GlobalChatState>({
        status: "connected",
        workflowId: null,
        threadWorkflowId: {},
        currentThreadId: null,
        threads: {},
        messageCache: {},
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn()
      });

    await handleChatWebSocketMessage(
      stub<WebSocketMessage>({
        type: "tool_call",
        tool_call_id: "tc_fail",
        name: "ui_fail",
        args: {},
        thread_id: "thread-1"
      }),
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

describe("chatProtocol media predictions", () => {
  const runtime = {
    status: "loading" as const,
    statusMessage: null,
    progress: { current: 0, total: 0 },
    error: null,
    planningUpdate: null,
    taskUpdate: null,
    logUpdate: null,
    runningToolCallId: "exec-1",
    toolMessage: "Running code",
    activePredictions: [] as Array<{
      id: string;
      provider: string;
      model: string;
      capability: string;
      startedAt: number;
    }>,
    sendMessageTimeoutId: null
  };

  const makeState = (): GlobalChatState =>
    partialChatState({
      status: "loading",
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          title: "T",
          updated_at: new Date().toISOString()
        }
      },
      threadRuntime: { "thread-1": { ...runtime, activePredictions: [] } },
      messageCache: { "thread-1": [] },
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    });

  const run = async (state: GlobalChatState, msg: WebSocketMessage) => {
    let captured = state;
    const set = jest.fn((updater) => {
      captured = {
        ...captured,
        ...(isStateUpdater(updater) ? updater(captured) : updater)
      };
    });
    await handleChatWebSocketMessage(
      msg,
      set,
      () => captured
    );
    return captured;
  };

  it("records a running media prediction and clears it on complete", async () => {
    let state = makeState();
    state = await run(state, {
      type: "prediction",
      id: "p1",
      thread_id: "thread-1",
      provider: "fal_ai",
      model: "flux-schnell",
      capability: "text_to_image",
      status: "running"
    });
    expect(state.threadRuntime["thread-1"].activePredictions).toEqual([
      expect.objectContaining({
        id: "p1",
        provider: "fal_ai",
        model: "flux-schnell",
        capability: "text_to_image"
      })
    ]);

    state = await run(state, {
      type: "prediction",
      id: "p1",
      thread_id: "thread-1",
      capability: "text_to_image",
      status: "completed"
    });
    expect(state.threadRuntime["thread-1"].activePredictions).toEqual([]);
  });

  it("ignores generate_messages predictions", async () => {
    const state = await run(makeState(), {
      type: "prediction",
      id: "p2",
      thread_id: "thread-1",
      provider: "openai",
      model: "gpt-5.4",
      capability: "generate_messages",
      status: "running"
    });
    expect(state.threadRuntime["thread-1"].activePredictions).toEqual([]);
  });
});

describe("sub-agent events", () => {
  const runtime = {
    status: "streaming",
    statusMessage: null,
    progress: { current: 0, total: 0 },
    error: null,
    planningUpdate: null,
    taskUpdate: null,
    logUpdate: null,
    runningToolCallId: null,
    toolMessage: null,
    sendMessageTimeoutId: null
  };

  const makeState = (): GlobalChatState =>
    partialChatState({
      status: "streaming",
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          title: "T",
          updated_at: new Date().toISOString()
        }
      },
      threadRuntime: { "thread-1": { ...runtime } },
      messageCache: { "thread-1": [] },
      subAgentMessages: {},
      selectedModel: { provider: "", id: "" },
      summarizeThread: jest.fn(),
      updateThreadTitle: jest.fn()
    });

  const run = async (state: GlobalChatState, msg: WebSocketMessage) => {
    let captured = state;
    const set = jest.fn((updater) => {
      captured = {
        ...captured,
        ...(isStateUpdater(updater) ? updater(captured) : updater)
      };
    });
    await handleChatWebSocketMessage(msg, set, () => captured);
    return captured;
  };

  it("keeps a child's text out of the parent's reply", async () => {
    let state = makeState();
    state = await run(state, {
      type: "chunk",
      thread_id: "thread-1",
      content: "parent text"
    });
    state = await run(state, {
      type: "chunk",
      thread_id: "thread-1",
      content: "child text",
      parent_tool_call_id: "call-1"
    });

    const parentMessages = state.messageCache["thread-1"] as Message[];
    expect(parentMessages).toHaveLength(1);
    expect(parentMessages[0].content).toBe("parent text");
    expect(state.subAgentMessages["thread-1"]["call-1"][0].content).toBe(
      "child text"
    );
  });

  it("a child's done chunk does not end the parent turn", async () => {
    const state = await run(makeState(), {
      type: "chunk",
      thread_id: "thread-1",
      content: "",
      done: true,
      parent_tool_call_id: "call-1"
    });
    expect(state.threadRuntime["thread-1"].status).toBe("streaming");
  });

  it("buckets a child's tool-call card and its result under the spawning call", async () => {
    let state = makeState();
    state = await run(state, {
      type: "message",
      role: "assistant",
      thread_id: "thread-1",
      content: null,
      parent_tool_call_id: "call-1",
      tool_calls: [{ id: "child-1", name: "search", args: { query: "x" } }]
    });
    state = await run(state, {
      type: "tool_result_update",
      node_id: "n1",
      thread_id: "thread-1",
      parent_tool_call_id: "call-1",
      tool_call_id: "child-1",
      name: "search",
      result: { hits: 1 }
    });

    expect(state.messageCache["thread-1"]).toHaveLength(0);
    const transcript = state.subAgentMessages["thread-1"]["call-1"];
    expect(transcript).toHaveLength(2);
    expect(transcript[1]).toEqual(
      expect.objectContaining({ role: "tool", tool_call_id: "child-1" })
    );
  });

  it("leaves a root-level tool result to the persisted tool message", async () => {
    const state = await run(makeState(), {
      type: "tool_result_update",
      node_id: "n1",
      thread_id: "thread-1",
      tool_call_id: "root-1",
      result: { ok: true }
    });
    expect(state.subAgentMessages).toEqual({});
  });
});
